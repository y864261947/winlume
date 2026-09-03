"use client";

import { memo, useEffect, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool";
import type { Artifact } from "@/lib/agent/types";
import type { StudioUIMessage } from "@/lib/studio/ui-message-adapter";
import Image from "next/image";
import { useModals } from "@/components/providers";
import MentionRichText from "./MentionRichText";
import ArtifactStatus from "./ArtifactStatus";
import { FileStack, UserRound } from "lucide-react";
import { LOADING_WORDS, nextLoadingWordIndex } from "@/lib/studio/loading-words";
import { getToolPresentation, isResultTool } from "@/lib/studio/tool-presentation";
import { showsMessageAvatar } from "@/lib/studio/chat-message-presentation";

export type ChatThreadProps = {
  /** Canonical AI SDK messages. This is the only production message model. */
  messages: StudioUIMessage[];
  streaming?: boolean;
  emptyHint?: string;
  highlightMessageId?: string | null;
  onHighlightConsumed?: () => void;
  artifactsByMessageId?: ReadonlyMap<string, Artifact[]>;
  imageArtifacts?: Artifact[];
  onOpenArtifact?: (artifactId: string) => void;
};

type StudioPart = StudioUIMessage["parts"][number];
type ActivityPhase = "preparing" | "thinking" | "tool" | "producing";

function formatThinkingDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const value = Math.round(seconds);
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function reasoningLabel(isStreaming: boolean, duration?: number) {
  if (isStreaming) return "正在思考";
  const formatted = duration === undefined ? "" : formatThinkingDuration(duration);
  return formatted ? `思考了 ${formatted}` : "已完成思考";
}

function StreamingPulse({ phase = "thinking" }: { phase?: ActivityPhase }) {
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
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className={`h-1.5 w-1.5 animate-bounce rounded-full ${color}`}
          style={{ animationDelay: `${index * 140}ms`, animationDuration: "0.9s" }}
        />
      ))}
    </span>
  );
}

function ActivityStatus({
  phase,
  startedAt,
  label,
  tone = "neutral",
  active = true,
}: {
  phase: ActivityPhase;
  startedAt?: number;
  label?: string;
  tone?: "neutral" | "error";
  active?: boolean;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [wordIndex, setWordIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!active || !startedAt) {
      setElapsed(0);
      setWordIndex(null);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  useEffect(() => {
    if (!active || label) return;
    setWordIndex((current) => nextLoadingWordIndex(current, LOADING_WORDS.length));
    const timer = window.setInterval(
      () => setWordIndex((current) => nextLoadingWordIndex(current, LOADING_WORDS.length)),
      2000,
    );
    return () => window.clearInterval(timer);
  }, [active, label]);

  const text = label ?? `${LOADING_WORDS[wordIndex ?? 0]}…`;
  return (
    <div
      className={`mb-1.5 flex items-center gap-2 text-[11px] leading-none ${
        tone === "error" ? "text-rose-600" : "text-[#8A8298]"
      }`}
    >
      {active ? <StreamingPulse phase={phase} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      <span className="select-none">{text}</span>
      {active && elapsed > 0 ? (
        <span className="tabular-nums text-[#B0A9BC]">{formatThinkingDuration(elapsed)}</span>
      ) : null}
    </div>
  );
}

function ArtifactDraftPreview({ name, text }: { name?: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="mb-3 overflow-hidden rounded-[14px] border border-dashed border-[rgba(15,23,42,0.22)] bg-[rgba(255,248,240,0.65)]">
      <div className="flex items-center gap-1.5 border-b border-[rgba(15,23,42,0.1)] px-2.5 py-1.5 text-[11px] text-[#0F172A]">
        <FileStack className="h-3.5 w-3.5" />
        <span className="font-medium">{name ? `正在写入「${name}」` : "正在写入作品"}</span>
        <StreamingPulse phase="tool" />
      </div>
      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-sans text-[12.5px] leading-5 text-[#241E36]">
        {text}
        <span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse rounded-sm bg-[#334155] align-middle" aria-hidden />
      </pre>
    </div>
  );
}

function DirectPartsBubble({
  message,
  streaming,
  imageArtifacts,
  onOpenArtifact,
  relatedArtifacts,
  highlighted,
  showAvatar,
  userAvatarLetter,
}: {
  message: StudioUIMessage;
  streaming: boolean;
  imageArtifacts?: Artifact[];
  onOpenArtifact?: (artifactId: string) => void;
  relatedArtifacts?: Artifact[];
  highlighted: boolean;
  showAvatar: boolean;
  userAvatarLetter: string;
}) {
  const isUser = message.role === "user";
  const isActive = streaming && message.role === "assistant";
  const preparing = message.metadata?.preparing;
  const toolNames = message.parts.flatMap((part) => {
    if (part.type === "dynamic-tool") return [part.toolName];
    if (part.type.startsWith("tool-")) return [part.type.slice(5)];
    return [];
  });
  const resultToolName = toolNames.find(isResultTool);
  const artifactPart = message.parts.find(
    (part): part is Extract<StudioPart, { type: "data-artifact" }> =>
      part.type === "data-artifact",
  );
  const draftPart = message.parts.find(
    (part): part is Extract<StudioPart, { type: "data-draft" }> =>
      part.type === "data-draft",
  );
  const compactWriteArtifact = resultToolName === "write_artifact";
  const textParts = message.parts.filter(
    (part): part is Extract<StudioPart, { type: "text" }> => part.type === "text",
  );

  return (
    <Message
      from={message.role}
      data-message-id={message.id}
      className={`max-w-none scroll-mt-4 px-4 sm:px-6 ${
        highlighted ? "rounded-[20px] bg-[rgba(51,65,85,0.10)] py-2 ring-2 ring-[rgba(51,65,85,0.35)]" : ""
      }`}
    >
      <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : showAvatar ? "" : "-mt-3 pl-11"}`}>
        {showAvatar ? (
          isUser ? (
            <span
              className="studio-user-avatar mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
              aria-hidden
            >
              {userAvatarLetter || <UserRound className="h-4 w-4" />}
            </span>
          ) : (
            <span className="studio-assistant-avatar mt-0.5" aria-hidden>
              <Image className="reizo-logo-day" src="/brand/logo-day.png" alt="" width={22} height={22} unoptimized />
              <Image className="reizo-logo-night" src="/brand/logo-night.png" alt="" width={22} height={22} unoptimized />
            </span>
          )
        ) : null}
        <MessageContent
          className={`min-w-0 max-w-[min(100%,42rem)] overflow-visible text-sm leading-6 ${
            isUser ? "studio-user-bubble rounded-[18px] px-4 py-3 shadow-md" : "bg-transparent p-0 text-[#0F172A]"
          }`}
        >
          {message.parts.map((part, index) => {
            const key = `${message.id}-part-${index}`;
            if (part.type === "text") {
              return isUser ? (
                <MentionRichText
                  key={key}
                  text={part.text}
                  imageArtifacts={imageArtifacts}
                  onOpenArtifact={onOpenArtifact}
                  tone="onDark"
                />
              ) : (
                <MessageResponse key={key} isAnimating={isActive} className="studio-assistant-markdown break-words">
                  {part.text}
                </MessageResponse>
              );
            }
            if (part.type === "reasoning") {
              return (
                <Reasoning
                  key={key}
                  isStreaming={isActive}
                  duration={message.metadata?.thinkingDurationSec}
                >
                  <ReasoningTrigger
                    getThinkingMessage={(isStreaming, duration) => reasoningLabel(isStreaming, duration)}
                  />
                  <ReasoningContent>{part.text}</ReasoningContent>
                </Reasoning>
              );
            }
            if (part.type === "data-plan") {
              return (
                <Task key={key} className="mb-2">
                  <TaskTrigger title="任务计划" />
                  <TaskContent>
                    {part.data.todos.map((todo) => (
                      <TaskItem key={todo.id}>
                        {todo.status === "completed" ? "已完成" : todo.status === "in_progress" ? "进行中" : "待处理"}：{todo.content}
                      </TaskItem>
                    ))}
                  </TaskContent>
                </Task>
              );
            }
            if (part.type === "data-artifact") {
              if (compactWriteArtifact) return null;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onOpenArtifact?.(part.data.artifactId)}
                  className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[rgba(15,23,42,0.18)] bg-[rgba(15,23,42,0.05)] px-2.5 py-1 text-xs font-medium hover:bg-[rgba(15,23,42,0.1)]"
                >
                  <FileStack className="h-3 w-3" />
                  {part.data.name}
                </button>
              );
            }
            if (part.type === "data-draft") {
              return compactWriteArtifact ? null : <ArtifactDraftPreview key={key} name={part.data.name} text={part.data.text} />;
            }
            if (part.type === "data-tool-log") {
              return (
                <div key={key} className="mb-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-[10px] border border-[rgba(15,23,42,0.1)] bg-white/55 px-2.5 py-2 text-[11px] leading-4 text-[#615A73]">
                  {part.data.text}
                </div>
              );
            }
            if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
              const tool = part as unknown as ToolPart;
              const toolName = tool.type === "dynamic-tool"
                ? tool.toolName
                : tool.type.replace(/^tool-/, "");
              if (isResultTool(toolName)) {
                return (
                  <ArtifactStatus
                    key={key}
                    toolName={toolName}
                    state={tool.state}
                    artifactName={artifactPart?.data.name ?? draftPart?.data.name}
                    onOpenArtifact={
                      artifactPart
                        ? () => onOpenArtifact?.(artifactPart.data.artifactId)
                        : undefined
                    }
                  />
                );
              }
              return (
                <Tool key={key} className="mb-2 max-w-xl overflow-hidden rounded-[12px] border-line/70 bg-white/35 shadow-none">
                  {tool.type === "dynamic-tool" ? (
                    <ToolHeader
                      type="dynamic-tool"
                      state={tool.state}
                      toolName={tool.toolName}
                      title={getToolPresentation(tool.toolName).label}
                      className="px-3 py-2.5"
                    />
                  ) : (
                    <ToolHeader type={tool.type} state={tool.state} className="px-3 py-2.5" />
                  )}
                  <ToolContent>
                    {"input" in tool && tool.input !== undefined ? <ToolInput input={tool.input} /> : null}
                    <ToolOutput
                      errorText={"errorText" in tool ? tool.errorText : undefined}
                      output={"output" in tool ? tool.output : undefined}
                    />
                  </ToolContent>
                </Tool>
              );
            }
            return null;
          })}
          {textParts.length === 0 && message.role === "assistant" && !message.parts.length ? (
            <ActivityStatus
              phase="preparing"
              label={preparing?.label}
              tone={preparing?.failed ? "error" : "neutral"}
              active={isActive && !preparing?.failed}
              startedAt={preparing?.startedAt}
            />
          ) : null}
          {relatedArtifacts?.length ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-[rgba(15,23,42,0.08)] pt-2">
              {relatedArtifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  type="button"
                  onClick={() => onOpenArtifact?.(artifact.id)}
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-[rgba(15,23,42,0.2)] bg-[rgba(15,23,42,0.06)] px-2 py-0.5 text-[11px] font-medium"
                >
                  <FileStack className="h-3 w-3 shrink-0" />
                  <span className="truncate">{artifact.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </MessageContent>
      </div>
    </Message>
  );
}

const MemoizedDirectPartsBubble = memo(DirectPartsBubble);

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
  const { account } = useModals();
  const userAvatarLetter = (account?.display_name || account?.username || "")
    .trim()
    .charAt(0)
    .toUpperCase();
  const threadRef = useRef<HTMLDivElement>(null);
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightMessageId) return;
    setActiveHighlight(highlightMessageId);
    requestAnimationFrame(() => {
      const node = threadRef.current?.querySelector(`[data-message-id="${CSS.escape(highlightMessageId)}"]`);
      if (node instanceof HTMLElement) node.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const timer = setTimeout(() => {
      setActiveHighlight(null);
      onHighlightConsumed?.();
    }, 2400);
    return () => clearTimeout(timer);
  }, [highlightMessageId, onHighlightConsumed]);

  if (messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <p className="text-center text-sm text-ink-400">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div ref={threadRef} className="relative flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-5 px-0 py-6">
          {messages.map((message, index) => (
            <MemoizedDirectPartsBubble
              key={message.id}
              message={message}
              streaming={streaming && index === messages.length - 1}
              showAvatar={showsMessageAvatar(messages, index)}
              userAvatarLetter={userAvatarLetter}
              highlighted={activeHighlight === message.id}
              relatedArtifacts={artifactsByMessageId?.get(message.id)}
              imageArtifacts={imageArtifacts}
              onOpenArtifact={onOpenArtifact}
            />
          ))}
        </ConversationContent>
        <ConversationScrollButton
          aria-label="回到底部"
          className="bottom-3 left-1/2 z-[2] h-8 w-8 -translate-x-1/2 rounded-full border-white/80 bg-white/90 text-[#615A73] shadow-md backdrop-blur hover:bg-white hover:text-[#241E36]"
        />
      </Conversation>
    </div>
  );
}
