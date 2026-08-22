/** Canonical AI SDK `UIMessage` hydration for durable Studio history. */

import type { UIMessage, UIMessagePart, UITools } from "ai";
import type { Message, UIMessagePart as PersistedUIMessagePart } from "@/lib/agent/types";

export type StudioMessageMetadata = {
  model?: string;
  skillIds?: string[];
  thinkingDurationSec?: number;
  preparing?: { label: string; startedAt: number; failed?: boolean };
};

export type StudioPlanTodo = {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
};

export type StudioDataParts = {
  plan: { todos: StudioPlanTodo[] };
  artifact: { artifactId: string; name: string; kind: string };
  draft: { name?: string; text: string };
  "tool-log": { text: string };
  error: { code: string };
  run: { runId: string; status?: string };
  "run-cursor": {
    runId: string;
    sequence: number;
    eventType?: string;
    messageId?: string;
  };
  session: { sessionId: string };
};

export type StudioUIMessage = UIMessage<StudioMessageMetadata, StudioDataParts>;

function persistedPartToUiPart(
  part: PersistedUIMessagePart,
): UIMessagePart<StudioDataParts, UITools> | null {
  if (
    part.type === "text" ||
    part.type === "reasoning" ||
    part.type === "data-plan" ||
    part.type === "data-artifact" ||
    part.type.startsWith("tool-")
  ) {
    return part as unknown as UIMessagePart<StudioDataParts, UITools>;
  }
  return null;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parsePersistedToolResult(
  rawContent: string | undefined,
): { ok: boolean; summary: string; output: unknown } | undefined {
  if (rawContent === undefined) return undefined;
  try {
    const parsed = JSON.parse(rawContent) as unknown;
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record.error === "string") {
        return { ok: false, summary: record.error, output: parsed };
      }
      if (typeof record.summary === "string") {
        return { ok: true, summary: record.summary, output: parsed };
      }
    }
    return {
      ok: true,
      summary: typeof parsed === "string" ? parsed : rawContent,
      output: parsed,
    };
  } catch {
    return { ok: true, summary: rawContent, output: rawContent };
  }
}

function planTodosFromToolResult(rawContent: string | undefined): StudioPlanTodo[] | undefined {
  if (!rawContent) return undefined;
  try {
    const parsed = JSON.parse(rawContent) as { todos?: unknown };
    return Array.isArray(parsed.todos) ? (parsed.todos as StudioPlanTodo[]) : undefined;
  } catch {
    return undefined;
  }
}

/** Convert durable server messages into the canonical AI SDK UIMessage shape. */
export function messageToStudioUIMessage(
  message: Message,
  allMessages: Message[] = [message],
): StudioUIMessage | null {
  if (message.role === "tool") return null;

  const receipts = new Map<string, Message>();
  for (const candidate of allMessages) {
    if (candidate.role === "tool" && candidate.toolCallId) {
      receipts.set(candidate.toolCallId, candidate);
    }
  }

  const parts: Array<UIMessagePart<StudioDataParts, UITools>> = [];
  const existingToolIds = new Set<string>();
  for (const persistedPart of message.parts ?? []) {
    const part = persistedPartToUiPart(persistedPart);
    if (!part) continue;
    if ("toolCallId" in part && typeof part.toolCallId === "string") {
      existingToolIds.add(part.toolCallId);
    }
    parts.push(part);
  }

  if (message.toolCalls?.length) {
    const todos = message.toolCalls
      .map((call) => planTodosFromToolResult(receipts.get(call.id)?.content))
      .find((value): value is StudioPlanTodo[] => Boolean(value?.length));
    if (todos?.length && !parts.some((part) => part.type === "data-plan")) {
      parts.push({ type: "data-plan", id: "plan", data: { todos } } as UIMessagePart<StudioDataParts, UITools>);
    }

    for (const call of message.toolCalls) {
      if (existingToolIds.has(call.id)) continue;
      const receipt = parsePersistedToolResult(receipts.get(call.id)?.content);
      const toolPart = receipt
        ? {
            type: "dynamic-tool" as const,
            toolName: call.name,
            toolCallId: call.id,
            state: receipt.ok ? ("output-available" as const) : ("output-error" as const),
            input: safeJson(call.arguments),
            ...(receipt.ok ? { output: receipt.output } : { errorText: receipt.summary }),
          }
        : {
            type: "dynamic-tool" as const,
            toolName: call.name,
            toolCallId: call.id,
            state: "input-available" as const,
            input: safeJson(call.arguments),
          };
      parts.push(toolPart as unknown as UIMessagePart<StudioDataParts, UITools>);
    }
  }

  if (parts.length === 0 && message.content) {
    parts.push({ type: "text", text: message.content });
  }

  return {
    id: message.id,
    role: message.role === "system" ? "system" : message.role,
    parts: parts as StudioUIMessage["parts"],
    ...(message.metadata ? { metadata: message.metadata } : {}),
  };
}

export function messagesToStudioUIMessage(messages: Message[]): StudioUIMessage[] {
  return messages
    .map((message) => messageToStudioUIMessage(message, messages))
    .filter((message): message is StudioUIMessage => message !== null);
}
