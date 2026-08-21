"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileStack,
  PencilLine,
  Sparkles,
  UserRound,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Artifact } from "@/lib/agent/types";
import {
  friendlyToolGroupSummary,
  friendlyToolView,
  toolActionLabel,
} from "@/lib/studio/tool-display";
import { LOADING_WORDS, nextLoadingWordIndex } from "@/lib/studio/loading-words";
import { getImageRefinementDisplay } from "@/lib/studio/image-annotations";
import type {
  ExecutionStep,
  StreamPhase,
  UiChatMessage,
  UiToolCall,
} from "./useStudioChat";
import MentionRichText from "./MentionRichText";
import StudioViewTransition from "./StudioViewTransition";
import { useSmoothStreamText } from "./useSmoothStreamText";
import WorkflowRunNotice from "./workflow/WorkflowRunNotice";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Shimmer } from "@/components/ai-elements/shimmer";

export type ChatThreadProps = {
  messages: UiChatMessage[];
  streaming?: boolean;
  emptyHint?: string;
  highlightMessageId?: string | null;
  onHighlightConsumed?: () => void;
  artifactsByMessageId?: ReadonlyMap<string, Artifact[]>;
  /** Session image artifacts for @mention chip thumbnails in user bubbles. */
  imageArtifacts?: Artifact[];
  onOpenArtifact?: (artifactId: string) => void;
};

const NEAR_BOTTOM_PX = 80;

function isNearBottom(el: HTMLElement, threshold = NEAR_BOTTOM_PX): boolean {
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distance <= threshold;
}

/** NewMax formatThinkingDuration: 12s / 1m 30s */
export function formatThinkingDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/**
 * NewMax StreamingPulse — three-phase soft pulse dots.
 * phases: thinking | tool | producing
 */
function StreamingPulse({
  phase = "thinking",
}: {
  phase?: Exclude<StreamPhase, "done">;
}) {
  const color =
    phase === "tool"
      ? "bg-[#0F172A]"
      : phase === "producing"
        ? "bg-[#334155]"
        : phase === "preparing"
          ? "bg-[#615A73]"
        : "bg-[#8A8298]";
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${color} animate-bounce`}
          style={{
            animationDelay: `${i * 140}ms`,
            animationDuration: "0.9s",
          }}
        />
      ))}
    </span>
  );
}

function useLiveElapsed(startedAt?: number, active?: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active || !startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt, active]);
  return elapsed;
}

const ROTATE_INTERVAL_MS = 2000;

function useRotatingLoadingWord(active: boolean): string {
  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    if (!active) {
      setIndex(null);
      return;
    }
    setIndex((i) => nextLoadingWordIndex(i, LOADING_WORDS.length));
    const id = window.setInterval(() => {
      setIndex((i) => nextLoadingWordIndex(i, LOADING_WORDS.length));
    }, ROTATE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [active]);
  return LOADING_WORDS[index ?? 0];
}

function ActivityStatus({
  phase,
  startedAt,
  toolName,
  label: customLabel,
  tone = "neutral",
  active = true,
}: {
  phase: Exclude<StreamPhase, "done">;
  startedAt?: number;
  toolName?: string;
  label?: string;
  tone?: "neutral" | "error";
  active?: boolean;
}) {
  const elapsed = useLiveElapsed(startedAt, active);
  const rotatingWord = useRotatingLoadingWord(active);
  const label =
    customLabel ??
    (phase === "tool" && toolName
      ? `${toolActionLabel(toolName)}…`
      : `${rotatingWord}…`);

  return (
    <div
      className={`mb-1.5 flex items-center gap-2 text-[11px] leading-none ${
        tone === "error" ? "text-rose-600" : "text-[#8A8298]"
      }`}
    >
      {active ? <StreamingPulse phase={phase} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      <span className="select-none">{label}</span>
      {active && elapsed > 0 ? (
        <span className="tabular-nums text-[#B0A9BC]">
          {formatThinkingDuration(elapsed)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * 折叠式任务清单 — 默认收起为一行(分段条 + 当前步骤 + 计数),
 * 点击展开为竖排清单。默认不自动展开,避免清单随流式增长而跳动。
 */
function PlanChecklist({
  steps,
  streaming,
}: {
  steps: ExecutionStep[];
  streaming?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!steps.length) return null;

  const doneCount = steps.filter((s) => s.status === "done").length;
  const allDone = doneCount === steps.length;
  const label =
    steps.find((s) => s.status === "active")?.label ??
    steps.find((s) => s.status === "pending")?.label ??
    steps.at(-1)?.label ??
    "任务进度";
  const multi = steps.length > 1;

  return (
    <div className="mb-2 min-w-0" role="group" aria-label="任务进度">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full min-w-0 items-center gap-2 rounded-[8px] px-1 py-1 text-left text-[12px] leading-5 transition hover:bg-white/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgba(15,23,42,0.28)]"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
        )}
        {multi ? (
          <span aria-hidden className="flex shrink-0 items-center gap-0.5">
            {steps.map((step) => (
              <span
                key={step.id}
                className={`h-[3px] w-2.5 rounded-full ${
                  step.status === "done"
                    ? "bg-emerald-500/70"
                    : step.status === "active"
                      ? "bg-[#0F172A]"
                      : "bg-[rgba(15,23,42,0.18)]"
                }`}
              />
            ))}
          </span>
        ) : null}
        <span
          className={`min-w-0 flex-1 truncate ${
            allDone ? "text-[#8A8298]" : "font-medium text-[#241E36]"
          }`}
          title={label}
        >
          {label}
        </span>
        {multi ? (
          <span className="shrink-0 tabular-nums text-[11px] text-[#B0A9BC]">
            {doneCount}/{steps.length}
          </span>
        ) : null}
        {streaming ? <StreamingPulse phase="tool" /> : null}
      </button>
      {expanded ? (
        <ol className="ms-[10px] mt-1 space-y-1 border-s border-[rgba(15,23,42,0.10)] py-0.5 ps-3">
          {steps.map((step) => {
            const done = step.status === "done";
            const active = step.status === "active";
            return (
              <li key={step.id} className="flex items-baseline gap-2 text-[12px] leading-5">
                <span className="flex w-3 shrink-0 justify-center" aria-hidden>
                  {done ? (
                    <Check
                      className="h-3 w-3 translate-y-[2px] text-emerald-600"
                      strokeWidth={2.5}
                    />
                  ) : active ? (
                    <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[#0F172A]" />
                  ) : (
                    <span className="mt-[7px] h-1.5 w-1.5 rounded-full border border-[rgba(15,23,42,0.28)]" />
                  )}
                </span>
                <span
                  className={`min-w-0 break-words ${
                    done
                      ? "text-[#8A8298]"
                      : active
                        ? "font-medium text-[#241E36]"
                        : "text-[#615A73]"
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}

/** Live markdown body while write_artifact args stream in */
function ArtifactDraftPreview({
  name,
  text,
}: {
  name?: string;
  text: string;
}) {
  if (!text.trim()) return null;
  return (
    <div className="mb-3 overflow-hidden rounded-[14px] border border-dashed border-[rgba(15,23,42,0.22)] bg-[rgba(255,248,240,0.65)]">
      <div className="flex items-center gap-1.5 border-b border-[rgba(15,23,42,0.1)] px-2.5 py-1.5 text-[11px] text-[#0F172A]">
        <FileStack className="h-3.5 w-3.5" />
        <span className="font-medium">
          {name ? `正在写入「${name}」` : "正在写入作品"}
        </span>
        <StreamingPulse phase="tool" />
      </div>
      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-sans text-[12.5px] leading-5 text-[#241E36]">
        {text}
        <span
          className="ml-0.5 inline-block h-3.5 w-1 animate-pulse rounded-sm bg-[#334155] align-middle"
          aria-hidden
        />
      </pre>
    </div>
  );
}

function AssistantMarkdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="studio-assistant-markdown break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 mt-1 text-lg font-semibold leading-7 text-[#0F172A] first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 text-base font-semibold leading-6 text-[#0F172A] first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-sm font-semibold leading-6 text-[#0F172A] first:mt-0">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-0.5 leading-6">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-[#0F172A]">{children}</strong>
          ),
          em: ({ children }) => <em className="text-[#475569]">{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="font-medium text-[#0F172A] underline decoration-[rgba(15,23,42,0.28)] underline-offset-2 transition hover:decoration-[#0F172A]"
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => {
            const isBlock = Boolean(className?.includes("language-"));
            if (isBlock) {
              return (
                <code className="block overflow-x-auto font-mono text-[12px] leading-5 text-slate-100">
                  {children}
                </code>
              );
            }
            return (
              <code className="mx-0.5 inline-flex items-center rounded-full border border-[rgba(15,23,42,0.14)] bg-[rgba(15,23,42,0.05)] px-2 py-0.5 font-mono text-[12px] font-medium leading-4 text-[#334155]">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-3 overflow-x-auto rounded-xl bg-[#0F172A] px-3.5 py-3 text-[12px] leading-5 last:mb-0">
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-3 border-l-2 border-[rgba(15,23,42,0.25)] pl-3 text-[#475569] last:mb-0">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-3 overflow-x-auto last:mb-0">
              <table className="w-full border-collapse text-left text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-[rgba(15,23,42,0.12)] bg-[rgba(15,23,42,0.05)] px-2.5 py-1.5 font-semibold text-[#334155]">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[rgba(15,23,42,0.1)] px-2.5 py-1.5 text-[#475569]">
              {children}
            </td>
          ),
          hr: () => <hr className="my-4 border-[rgba(15,23,42,0.12)]" />,
        }}
      >
        {content}
      </ReactMarkdown>
      {streaming ? (
        <span
          className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[#334155] align-middle"
          aria-hidden
        />
      ) : null}
    </div>
  );
}

/**
 * NewMax thinking-line + optional full transcript — same look and prop
 * contract as before, now built on AI Elements' `Reasoning` primitive
 * instead of a hand-rolled collapsible (auto-open-while-streaming,
 * auto-close-shortly-after-done, and controllable-open state all come from
 * the official component; only the visual styling and the Chinese copy are
 * ours). The stick-to-bottom-while-streaming scroll behavior is re-added
 * here since `ReasoningContent` doesn't provide one on its own.
 */
function ThinkingBlock({
  text,
  streaming,
  durationSec,
  phase,
}: {
  text?: string;
  streaming?: boolean;
  durationSec?: number;
  phase?: StreamPhase;
}) {
  const hasText = Boolean(text?.trim());
  const isLiveThinking = Boolean(
    streaming && (phase === "thinking" || (hasText && phase !== "producing")),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  // Follow the streamed text, but only while the reader hasn't scrolled up
  // to look at something earlier — matched via the same "stick" pattern the
  // outer thread scroller uses.
  useEffect(() => {
    if (!stickToBottomRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  if (!hasText && !streaming) {
    // Completed turn with no thinking tokens but we measured pre-text wait
    if (durationSec && durationSec > 0) {
      return (
        <div className="thinking-line mb-2 text-[11px] text-[#8A8298]">
          思考 {formatThinkingDuration(durationSec)}
        </div>
      );
    }
    return null;
  }

  if (!hasText) return null;

  return (
    <Reasoning
      isStreaming={isLiveThinking}
      duration={isLiveThinking ? undefined : durationSec}
      className="mb-2 overflow-hidden rounded-[12px] border border-dashed border-[rgba(15,23,42,0.14)] bg-white/55 text-xs text-[#615A73]"
    >
      <ReasoningTrigger
        className="gap-1.5 rounded-t-[12px] px-2.5 py-1.5 text-[#615A73] transition hover:bg-white/40 hover:text-[#0F172A] [&_svg]:h-3 [&_svg]:w-3 [&_svg:first-child]:text-[#0F172A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgba(15,23,42,0.28)]"
        getThinkingMessage={(isStreamingNow, duration) =>
          isStreamingNow ? (
            <Shimmer className="text-xs font-medium" duration={1.2}>
              思考中…
            </Shimmer>
          ) : (
            <span className="font-medium">
              {duration ? `思考 ${formatThinkingDuration(duration)}` : "思考过程"}
            </span>
          )
        }
      />
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottomRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="max-h-48 overflow-y-auto border-t border-white/50"
      >
        <ReasoningContent className="mt-0 whitespace-pre-wrap px-2.5 py-2 text-[11px] leading-4 text-[#615A73]">
          {text ?? ""}
        </ReasoningContent>
      </div>
    </Reasoning>
  );
}

function ToolGroup({
  tools,
  thinkingDurationSec,
  onOpenArtifact,
}: {
  tools: UiToolCall[];
  thinkingDurationSec?: number;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!tools.length) return null;

  const running = tools.some((t) => t.status === "running");
  const summary = friendlyToolGroupSummary(tools);
  const allWriteOk =
    !running &&
    tools.length > 0 &&
    tools.every((t) => t.name === "write_artifact" && t.ok !== false);

  const thinkingSuffix =
    !running && thinkingDurationSec && thinkingDurationSec > 0
      ? ` · 思考 ${formatThinkingDuration(thinkingDurationSec)}`
      : "";

  const headerTitle = running
    ? "正在处理"
    : allWriteOk
      ? "已保存作品"
      : "本轮操作";

  return (
    <div className="mb-2 rounded-[12px] border border-[rgba(15,23,42,0.07)] bg-white/55 text-xs text-[#615A73]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-t-[12px] px-2.5 py-1.5 text-left transition hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgba(15,23,42,0.28)]"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
        )}
        {allWriteOk && !running ? (
          <Check className="h-3 w-3 shrink-0 text-emerald-600" />
        ) : (
          <FileStack className="h-3 w-3 shrink-0 text-[#0F172A]" />
        )}
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-[#241E36]">{headerTitle}</span>
          {summary ? (
            <span className="ml-1.5 text-[#8A8298]">
              {summary}
              {thinkingSuffix}
            </span>
          ) : thinkingSuffix ? (
            <span className="ml-1.5 text-[#8A8298]">{thinkingSuffix.trim()}</span>
          ) : null}
        </span>
        {running ? <StreamingPulse phase="tool" /> : null}
      </button>
      {open ? (
        <ul className="space-y-1.5 border-t border-white/50 px-2.5 py-2">
          {tools.map((t) => (
            <ToolCallRow key={t.id} tool={t} onOpenArtifact={onOpenArtifact} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** One tool call: the friendly one-liner by default, raw name/args/result on demand. */
function ToolCallRow({
  tool: t,
  onOpenArtifact,
}: {
  tool: UiToolCall;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const view = friendlyToolView(t.name, {
    status: t.status,
    ok: t.ok,
    summary: t.resultSummary,
    input: t.input,
  });
  const rawInput = (() => {
    if (t.input === undefined) return "";
    try {
      return JSON.stringify(t.input, null, 2);
    } catch {
      return String(t.input);
    }
  })();

  return (
    <li className="flex flex-col gap-1 rounded-[10px] bg-white/55 px-2.5 py-2">
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-[12px] font-medium leading-4 text-[#241E36]">
          {view.actionLabel}
        </span>
        <span
          className={`shrink-0 text-[10px] ${
            t.status === "running"
              ? "text-[#0F172A]"
              : t.ok === false
                ? "text-red-500"
                : "text-emerald-600"
          }`}
        >
          {t.status === "running" ? "进行中" : t.ok === false ? "失败" : "完成"}
        </span>
      </div>
      {view.resultLine ? (
        <p className="text-[11px] leading-4 text-[#8A8298]">{view.resultLine}</p>
      ) : null}
      <div className="flex items-center gap-3">
        {view.artifactId && onOpenArtifact ? (
          <button
            type="button"
            onClick={() => onOpenArtifact(view.artifactId!)}
            className="self-start text-[11px] font-medium text-[#0F172A] underline-offset-2 hover:underline"
          >
            打开作品
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
          className="self-start text-[11px] font-medium text-[#8A8298] underline-offset-2 hover:text-[#0F172A] hover:underline"
        >
          {showRaw ? "收起详情" : "查看详情"}
        </button>
      </div>
      {showRaw ? (
        <div className="mt-0.5 space-y-1.5 border-s border-[rgba(15,23,42,0.12)] ps-2.5">
          <p className="font-mono text-[10.5px] leading-4 text-[#8A8298]">
            工具：<span className="text-[#615A73]">{t.name}</span>
          </p>
          {rawInput ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-[rgba(15,23,42,0.04)] px-2 py-1.5 font-mono text-[10.5px] leading-4 text-[#615A73]">
              {rawInput}
            </pre>
          ) : null}
          {t.resultSummary ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-[8px] bg-[rgba(15,23,42,0.04)] px-2 py-1.5 font-mono text-[10.5px] leading-4 text-[#615A73]">
              {t.resultSummary}
            </pre>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function Bubble({
  message,
  highlighted,
  relatedArtifacts,
  imageArtifacts,
  onOpenArtifact,
  shareTransitionName,
}: {
  message: UiChatMessage;
  highlighted?: boolean;
  relatedArtifacts?: Artifact[];
  imageArtifacts?: Artifact[];
  onOpenArtifact?: (artifactId: string) => void;
  /** Shared element name for home → session morph (View Transition). */
  shareTransitionName?: string;
}) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const refinementDisplay = isUser
    ? getImageRefinementDisplay(message.content)
    : null;
  // Must run unconditionally (Rules of Hooks) even though early returns below
  // never use it — only paces the assistant text bubble further down.
  const displayedContent = useSmoothStreamText(
    message.content,
    isAssistant && Boolean(message.streaming),
  );
  const displayedThinking = useSmoothStreamText(
    message.thinking ?? "",
    isAssistant && Boolean(message.streaming),
  );

  if (message.presentation?.kind === "workflow_run") {
    return (
      <WorkflowRunNotice
        presentation={message.presentation}
        messageId={message.id}
      />
    );
  }

  if (message.role === "system" || message.role === "tool") {
    return (
      <div className="flex justify-center px-4" data-message-id={message.id}>
        <p className="max-w-2xl rounded-[12px] bg-white/50 px-3 py-1.5 text-center text-xs text-[#8A8298]">
          {message.content || message.role}
        </p>
      </div>
    );
  }

  const phase: StreamPhase =
    message.streamPhase ??
    (message.streaming
      ? message.toolCalls?.some((t) => t.status === "running")
        ? "tool"
        : message.content
          ? "producing"
          : "thinking"
      : "done");

  const runningTool = message.toolCalls?.find((t) => t.status === "running");
  const showActivity =
    isAssistant &&
    (message.streaming || message.activityTone === "error" || Boolean(message.activityLabel)) &&
    (phase === "preparing" ||
      phase === "thinking" ||
      phase === "tool" ||
      !message.content) &&
    !(message.executionSteps && message.executionSteps.length > 0);

  const showPlan =
    isAssistant &&
    message.executionSteps &&
    message.executionSteps.length > 0 &&
    (message.streaming ||
      message.executionSteps.some((s) => s.status === "done"));

  const row = (
    <div
      data-message-id={message.id}
      className={`flex gap-3 px-4 sm:px-6 scroll-mt-4 ${isUser ? "flex-row-reverse" : ""} ${
        highlighted
          ? "rounded-[20px] bg-[rgba(51,65,85,0.10)] py-2 ring-2 ring-[rgba(51,65,85,0.35)]"
          : ""
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-gradient-to-br from-[#334155] to-[#0F172A] text-white shadow-[0_4px_10px_-4px_rgba(15,23,42,0.55)]"
            : "bg-white/80 text-[#0F172A] ring-1 ring-white/90"
        }`}
        aria-hidden
      >
        {isUser ? (
          <UserRound className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
      </span>
      <div
        className={`min-w-0 max-w-[min(100%,42rem)] text-sm leading-6 ${
          isUser
            ? "studio-user-bubble shadow-md rounded-[18px] px-4 py-3"
            : "text-[#0F172A]"
        }`}
      >
        {showPlan ? (
          <PlanChecklist
            steps={message.executionSteps!}
            streaming={message.streaming}
          />
        ) : null}

        {isAssistant && showActivity ? (
          <ActivityStatus
            phase={phase === "done" ? "thinking" : phase}
            startedAt={message.streamStartedAt}
            toolName={runningTool?.name}
            label={message.activityLabel}
            tone={message.activityTone}
            active={Boolean(message.streaming)}
          />
        ) : null}

        {isAssistant && message.streaming && message.artifactDraft?.text ? (
          <ArtifactDraftPreview
            name={message.artifactDraft.name}
            text={message.artifactDraft.text}
          />
        ) : null}

        {isAssistant ? (
          <ThinkingBlock
            text={displayedThinking}
            streaming={message.streaming}
            durationSec={message.thinkingDurationSec}
            phase={phase}
          />
        ) : null}

        {isAssistant && message.toolCalls && message.toolCalls.length > 0 ? (
          <ToolGroup
            tools={message.toolCalls}
            thinkingDurationSec={
              message.streaming ? undefined : message.thinkingDurationSec
            }
            onOpenArtifact={onOpenArtifact}
          />
        ) : null}

        {message.content ? (
          isUser ? (
            refinementDisplay ? (
              <div className="flex flex-wrap items-center gap-1.5" aria-label={`已提交 ${refinementDisplay.notes.length} 处图片局部修改`}>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-xs font-medium text-white">
                  <PencilLine className="h-3.5 w-3.5 shrink-0" />
                  图片局部修改
                  <span className="tabular-nums text-white/70">{refinementDisplay.notes.length} 处</span>
                </span>
                {refinementDisplay.notes.map((note, index) => (
                  <span
                    key={`${index}-${note}`}
                    className="max-w-full break-words rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/90"
                  >
                    {note}
                  </span>
                ))}
              </div>
            ) : (
              <MentionRichText
                text={message.content}
                imageArtifacts={imageArtifacts}
                onOpenArtifact={onOpenArtifact}
                tone="onDark"
              />
            )
          ) : (
            <AssistantMarkdown
              content={displayedContent}
              streaming={message.streaming}
            />
          )
        ) : isAssistant &&
          !message.streaming &&
          !message.thinking &&
          !(message.toolCalls && message.toolCalls.length) &&
          !message.activityLabel ? (
          <span className="text-xs text-[#8A8298]">（无回复内容）</span>
        ) : null}

        {relatedArtifacts && relatedArtifacts.length > 0 ? (
          <div
            className={`mt-2.5 flex flex-wrap gap-1.5 border-t pt-2 ${
              isUser ? "border-white/30" : "border-[rgba(15,23,42,0.08)]"
            }`}
          >
            {relatedArtifacts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onOpenArtifact?.(a.id)}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-[rgba(15,23,42,0.2)] bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[11px] font-medium text-[#0F172A] transition hover:bg-[rgba(15,23,42,0.12)]"
                title={`打开作品：${a.name}`}
              >
                <FileStack className="h-3 w-3 shrink-0" />
                <span className="truncate">{a.name}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (!shareTransitionName) return row;
  return (
    <StudioViewTransition
      name={shareTransitionName}
      share="studio-morph"
      default="none"
    >
      {row}
    </StudioViewTransition>
  );
}

export default function ChatThread({
  messages,
  streaming = false,
  emptyHint = "发送一条消息开始对话。",
  highlightMessageId = null,
  onHighlightConsumed,
  artifactsByMessageId,
  imageArtifacts,
  onOpenArtifact,
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);

  const syncStick = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    stickRef.current = near;
    setShowJump(!near);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollerRef.current;
    if (!el) {
      bottomRef.current?.scrollIntoView({ behavior, block: "end" });
      return;
    }
    el.scrollTo({ top: el.scrollHeight, behavior });
    stickRef.current = true;
    setShowJump(false);
  }, []);

  useEffect(() => {
    if (highlightMessageId) {
      stickRef.current = false;
      setActiveHighlight(highlightMessageId);
      requestAnimationFrame(() => {
        const node = scrollerRef.current?.querySelector(
          `[data-message-id="${CSS.escape(highlightMessageId)}"]`,
        );
        if (node instanceof HTMLElement) {
          node.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
      const t = setTimeout(() => {
        setActiveHighlight(null);
        onHighlightConsumed?.();
      }, 2400);
      return () => clearTimeout(t);
    }
  }, [highlightMessageId, onHighlightConsumed]);

  useEffect(() => {
    if (highlightMessageId) return;
    if (!stickRef.current) {
      setShowJump(true);
      return;
    }
    scrollToBottom(streaming ? "auto" : "smooth");
  }, [messages, streaming, scrollToBottom, highlightMessageId]);

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <p className="text-center text-sm text-ink-400">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollerRef}
        className="min-h-0 flex-1 overflow-y-auto py-6"
        onScroll={syncStick}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.map((m, index) => {
            // Home→session morph only for the optimistic first bubble.
            // Scoped by m.id (which already embeds the session id, see
            // optimisticUserMessage/readHandoffBootstrap) rather than a bare
            // constant — two overlapping handoff attempts (e.g. the previous
            // session's page hasn't finished unmounting yet) would otherwise
            // mount two <ViewTransition> with the same name, which React
            // rejects outright.
            const shareTransitionName =
              m.role === "user" && m.id.startsWith("pending-user-")
                ? `studio-handoff-user-${m.id}`
                : undefined;
            return (
              <Bubble
                // Position, not `m.id`: the store swaps a turn's client-minted
                // id for the server's persisted id the moment history is
                // reconciled (seedLiveChatFromServer), which — keyed on id —
                // would unmount/remount this Bubble and wipe every open
                // ThinkingBlock/ToolGroup/PlanChecklist disclosure state right
                // as a turn finishes. Messages only ever append or get patched
                // in place, never reorder, so the index is stable across that
                // swap and the id churn stops mattering here.
                key={index}
                message={m}
                highlighted={activeHighlight === m.id}
                relatedArtifacts={artifactsByMessageId?.get(m.id)}
                imageArtifacts={imageArtifacts}
                onOpenArtifact={onOpenArtifact}
                shareTransitionName={shareTransitionName}
              />
            );
          })}
          <div ref={bottomRef} className="h-px shrink-0" aria-hidden />
        </div>
      </div>

      {showJump ? (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className="absolute bottom-3 left-1/2 z-[2] flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-[#615A73] shadow-md backdrop-blur transition hover:bg-white hover:text-[#241E36]"
        >
          <ChevronDown className="h-3.5 w-3.5" />
          回到底部
          {streaming ? (
            <span className="ml-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-[#334155]" />
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
