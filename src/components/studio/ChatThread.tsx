"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  FileStack,
  Sparkles,
  UserRound,
  Wrench,
} from "lucide-react";
import type { Artifact } from "@/lib/agent/types";
import type {
  StreamPhase,
  UiChatMessage,
  UiToolCall,
} from "./useStudioChat";

export type ChatThreadProps = {
  messages: UiChatMessage[];
  streaming?: boolean;
  emptyHint?: string;
  highlightMessageId?: string | null;
  onHighlightConsumed?: () => void;
  artifactsByMessageId?: ReadonlyMap<string, Artifact[]>;
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
      ? "bg-[#C2410C]"
      : phase === "producing"
        ? "bg-[#F2994A]"
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

function ActivityStatus({
  phase,
  startedAt,
  toolName,
}: {
  phase: Exclude<StreamPhase, "done">;
  startedAt?: number;
  toolName?: string;
}) {
  const elapsed = useLiveElapsed(startedAt, true);
  const label =
    phase === "tool"
      ? toolName
        ? `正在调用 ${toolName}…`
        : "正在调用工具…"
      : phase === "producing"
        ? "正在撰写…"
        : "思考中…";

  return (
    <div className="mb-1.5 flex items-center gap-2 text-[11px] leading-none text-[#8A8298]">
      <StreamingPulse phase={phase} />
      <span className="select-none">{label}</span>
      {elapsed > 0 ? (
        <span className="tabular-nums text-[#B0A9BC]">
          {formatThinkingDuration(elapsed)}
        </span>
      ) : null}
    </div>
  );
}

/**
 * NewMax thinking-line + optional full transcript.
 * - While streaming with text: auto-open, live
 * - When done: collapsed one-liner "思考 12s", expand for detail
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
  const [open, setOpen] = useState(isLiveThinking);

  // Auto-open while live thinking; auto-collapse when producing/done (if no user override... keep simple)
  useEffect(() => {
    if (isLiveThinking) setOpen(true);
    else if (!streaming && hasText) setOpen(false);
  }, [isLiveThinking, streaming, hasText]);

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

  const header =
    streaming && phase !== "producing"
      ? "思考中…"
      : durationSec
        ? `思考 ${formatThinkingDuration(durationSec)}`
        : "思考过程";

  return (
    <div className="mb-2 overflow-hidden rounded-[12px] border border-dashed border-[rgba(194,65,12,0.18)] bg-[rgba(242,153,74,0.05)] text-xs text-[#615A73]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left transition hover:bg-white/40"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
        )}
        <Brain className="h-3 w-3 shrink-0 text-[#C2410C]" />
        <span className="font-medium text-[#615A73]">{header}</span>
        {streaming && phase !== "producing" ? (
          <span className="ml-auto">
            <StreamingPulse phase="thinking" />
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="max-h-48 overflow-y-auto border-t border-white/50 px-2.5 py-2">
          <p className="whitespace-pre-wrap text-[11px] leading-4 text-[#615A73]">
            {text}
            {streaming && phase !== "producing" ? (
              <span className="ml-0.5 inline-block h-3 w-1 animate-pulse rounded-sm bg-[#F2994A] align-middle" />
            ) : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ToolGroup({
  tools,
  thinkingDurationSec,
}: {
  tools: UiToolCall[];
  thinkingDurationSec?: number;
}) {
  const [open, setOpen] = useState(false);
  if (!tools.length) return null;

  const running = tools.some((t) => t.status === "running");
  const names = tools.map((t) => t.name).filter(Boolean);
  const unique = [...new Set(names)];
  const summary =
    unique.length === 0
      ? `${tools.length} 个工具`
      : unique.length <= 2
        ? unique.join(" · ")
        : `${unique.slice(0, 2).join(" · ")} 等 ${tools.length} 项`;

  // NewMax tool-group-header: "summary · Thinking 12s"
  const thinkingSuffix =
    !running && thinkingDurationSec && thinkingDurationSec > 0
      ? ` · 思考 ${formatThinkingDuration(thinkingDurationSec)}`
      : "";

  return (
    <div className="mb-2 rounded-[12px] border border-white/60 bg-white/40 text-xs text-[#615A73]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left transition hover:bg-white/50"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
        )}
        <Wrench className="h-3 w-3 shrink-0 text-[#C2410C]" />
        <span className="min-w-0 flex-1 truncate">
          {running ? "正在调用工具…" : "已使用工具"}
          <span className="ml-1.5 text-[#8A8298]">
            {summary}
            {thinkingSuffix}
          </span>
        </span>
        {running ? <StreamingPulse phase="tool" /> : null}
      </button>
      {open ? (
        <ul className="space-y-1.5 border-t border-white/50 px-2.5 py-2">
          {tools.map((t) => (
            <li key={t.id} className="rounded-[8px] bg-white/50 px-2 py-1.5">
              <div className="flex items-center gap-1.5 font-medium text-[#241E36]">
                <span className="font-mono text-[11px]">{t.name}</span>
                <span
                  className={`ml-auto text-[10px] ${
                    t.status === "running"
                      ? "text-[#C2410C]"
                      : t.ok === false
                        ? "text-red-500"
                        : "text-[#8A8298]"
                  }`}
                >
                  {t.status === "running"
                    ? "运行中"
                    : t.ok === false
                      ? "失败"
                      : "完成"}
                </span>
              </div>
              {t.resultSummary ? (
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[11px] leading-4 text-[#615A73]">
                  {t.resultSummary}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Bubble({
  message,
  highlighted,
  relatedArtifacts,
  onOpenArtifact,
}: {
  message: UiChatMessage;
  highlighted?: boolean;
  relatedArtifacts?: Artifact[];
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

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
    message.streaming &&
    (phase === "thinking" || phase === "tool" || !message.content);

  return (
    <div
      data-message-id={message.id}
      className={`flex gap-3 px-4 sm:px-6 scroll-mt-4 ${isUser ? "flex-row-reverse" : ""} ${
        highlighted
          ? "rounded-[20px] bg-[rgba(242,153,74,0.12)] py-2 ring-2 ring-[rgba(242,153,74,0.45)]"
          : ""
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-gradient-to-br from-[#F2994A] to-[#C2410C] text-white shadow-[0_4px_10px_-4px_rgba(194,65,12,0.55)]"
            : "bg-white/80 text-[#C2410C] ring-1 ring-white/90"
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
        className={`min-w-0 max-w-[min(100%,42rem)] rounded-[18px] px-4 py-3 text-sm leading-6 ${
          isUser ? "studio-user-bubble shadow-md" : "studio-assistant-bubble"
        }`}
      >
        {isAssistant && showActivity ? (
          <ActivityStatus
            phase={phase === "done" ? "thinking" : phase}
            startedAt={message.streamStartedAt}
            toolName={runningTool?.name}
          />
        ) : null}

        {isAssistant ? (
          <ThinkingBlock
            text={message.thinking}
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
          />
        ) : null}

        {message.content ? (
          <div className="whitespace-pre-wrap break-words">
            {message.content}
            {message.streaming && message.content ? (
              <span
                className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[#F2994A] align-middle"
                aria-hidden
              />
            ) : null}
          </div>
        ) : isAssistant &&
          !message.streaming &&
          !message.thinking &&
          !(message.toolCalls && message.toolCalls.length) ? (
          <span className="text-xs text-[#8A8298]">（无回复内容）</span>
        ) : null}

        {relatedArtifacts && relatedArtifacts.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-white/50 pt-2">
            {relatedArtifacts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onOpenArtifact?.(a.id)}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-[rgba(194,65,12,0.2)] bg-[rgba(194,65,12,0.06)] px-2 py-0.5 text-[11px] font-medium text-[#C2410C] transition hover:bg-[rgba(194,65,12,0.12)]"
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
}

export default function ChatThread({
  messages,
  streaming = false,
  emptyHint = "发送一条消息开始对话。",
  highlightMessageId = null,
  onHighlightConsumed,
  artifactsByMessageId,
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
          {messages.map((m) => (
            <Bubble
              key={m.id}
              message={m}
              highlighted={activeHighlight === m.id}
              relatedArtifacts={artifactsByMessageId?.get(m.id)}
              onOpenArtifact={onOpenArtifact}
            />
          ))}
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
            <span className="ml-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-[#F2994A]" />
          ) : null}
        </button>
      ) : null}
    </div>
  );
}
