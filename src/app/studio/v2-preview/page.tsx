"use client";

/**
 * Standalone diagnostic harness for the canonical Studio chat hook, rendered
 * with the official AI Elements components against raw `UIMessage.parts` —
 * so this is what a real AI-SDK chat surface would actually look/feel like.
 * Deliberately isolated from
 * `/studio/c/[sessionId]`: zero risk to the shipping chat UI.
 */

import { useState } from "react";
import type { UIMessage } from "ai";
import { useStudioChat } from "@/components/studio/useStudioChat";
import { FALLBACK_DEFAULT_MODEL } from "@/lib/studio/prefs";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Task, TaskContent, TaskItem, TaskTrigger } from "@/components/ai-elements/task";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";
import type { ToolPart } from "@/components/ai-elements/tool";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";

type PlanTodo = { id: string; content: string; status: string };

function renderPart(part: UIMessage["parts"][number], key: string, isStreaming: boolean) {
  if (part.type === "reasoning") {
    if (!part.text) return null;
    return (
      <Reasoning key={key} isStreaming={isStreaming}>
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    );
  }

  if (part.type === "data-plan") {
    const todos = (part as { data?: { todos?: PlanTodo[] } }).data?.todos ?? [];
    if (!todos.length) return null;
    return (
      <Task key={key}>
        <TaskTrigger title="计划" />
        <TaskContent>
          {todos.map((t) => (
            <TaskItem key={t.id}>
              [{t.status}] {t.content}
            </TaskItem>
          ))}
        </TaskContent>
      </Task>
    );
  }

  if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
    const p = part as unknown as ToolPart;
    const header =
      p.type === "dynamic-tool" ? (
        <ToolHeader state={p.state} toolName={p.toolName} type={p.type} />
      ) : (
        <ToolHeader state={p.state} type={p.type} />
      );
    return (
      <Tool key={key}>
        {header}
        <ToolContent>
          {"input" in p && p.input !== undefined ? <ToolInput input={p.input} /> : null}
          <ToolOutput
            errorText={"errorText" in p ? p.errorText : undefined}
            output={"output" in p ? p.output : undefined}
          />
        </ToolContent>
      </Tool>
    );
  }

  return null;
}

export default function StudioV2PreviewPage() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [draft, setDraft] = useState("");
  const [firstSend, setFirstSend] = useState(true);

  const chat = useStudioChat({
    sessionId,
    model: FALLBACK_DEFAULT_MODEL,
    onSession: (id) => console.log("[v2-preview] session confirmed:", id),
    onUnauthorized: () => console.warn("[v2-preview] unauthorized"),
    onArtifact: (a) => console.log("[v2-preview] artifact:", a),
  });

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    setDraft("");
    if (firstSend) {
      setFirstSend(false);
      const prepared = chat.prepare(text);
      await prepared?.commit(text, { bootstrap: { title: text.slice(0, 40) } });
    } else {
      await chat.send(text);
    }
  };

  return (
    <div className="mx-auto flex h-screen max-w-3xl flex-col gap-2 p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>AI SDK chat diagnostic · session {sessionId.slice(0, 8)}</span>
        <span>{chat.error ? `error: ${chat.error}` : chat.streaming ? "streaming…" : "ready"}</span>
      </div>

      <Conversation className="min-h-0 flex-1 rounded-lg border">
        <ConversationContent>
          {chat.messages.length === 0 ? (
            <ConversationEmptyState
              description="发一条消息试试思考过程、工具调用、计划清单"
              title="还没有消息"
            />
          ) : (
            chat.messages.map((m, i) => {
              const isLast = i === chat.messages.length - 1;
              const textParts = m.parts.filter(
                (p): p is Extract<UIMessage["parts"][number], { type: "text" }> => p.type === "text",
              );
              const otherParts = m.parts.filter((p) => p.type !== "text");
              return (
                <Message from={m.role} key={m.id}>
                  <MessageContent>
                    {otherParts.map((p, j) => renderPart(p, `${m.id}-${j}`, chat.streaming && isLast))}
                    {textParts.length ? (
                      <MessageResponse>{textParts.map((p) => p.text).join("")}</MessageResponse>
                    ) : null}
                  </MessageContent>
                </Message>
              );
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput
        onSubmit={(message) => {
          void handleSend(message.text ?? draft);
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            onChange={(e) => setDraft(e.target.value)}
            placeholder="输入消息…"
            value={draft}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <span className="text-xs text-muted-foreground">
              {chat.queue.length > 0 ? `${chat.queue.length} 条排队中` : null}
            </span>
          </PromptInputTools>
          <PromptInputSubmit disabled={!draft.trim()} status={chat.streaming ? "streaming" : "ready"} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
