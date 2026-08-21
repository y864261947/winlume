/**
 * `ai`'s `UIMessage` (parts-based) <-> this app's `UiChatMessage` (the flat
 * shape `ChatThread.tsx` renders today). Lets a `useChat`-backed hook feed
 * the existing renderer unchanged until Phase 4 rewrites it directly against
 * `parts`.
 */

import type { UIMessage } from "ai";
import { createExecutionMap, reduceExecutionMap } from "@/lib/studio/execution-map";
import type { UiChatMessage, UiToolCall } from "@/lib/studio/live-agent-events";

type PlanTodo = {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
};

function summarizeToolOutput(output: unknown): string | undefined {
  if (output && typeof output === "object" && "summary" in output) {
    const summary = (output as { summary?: unknown }).summary;
    if (typeof summary === "string") return summary;
  }
  if (typeof output === "string") return output;
  if (output === undefined) return undefined;
  try {
    return JSON.stringify(output);
  } catch {
    return undefined;
  }
}

type PreparingMetadata = { label: string; startedAt: number; failed?: boolean };

export function uiMessageToChatMessage(
  message: UIMessage,
  opts: { streaming: boolean },
): UiChatMessage {
  // useStudioChatV2's prepare() placeholder — see the comment at its call
  // site for why this lives in metadata instead of parts. Rendered the same
  // way the legacy store's assistantPreparingMessage() message was.
  const preparing = (message.metadata as { preparing?: PreparingMetadata } | undefined)
    ?.preparing;
  if (preparing) {
    return {
      id: message.id,
      role: message.role as UiChatMessage["role"],
      content: "",
      streaming: !preparing.failed,
      streamPhase: "preparing",
      streamStartedAt: preparing.startedAt,
      activityLabel: preparing.label,
      ...(preparing.failed ? { activityTone: "error" as const } : {}),
    };
  }

  let content = "";
  let thinking = "";
  const toolCalls: UiToolCall[] = [];
  let todos: PlanTodo[] | undefined;

  for (const part of message.parts ?? []) {
    if (part.type === "text") {
      content += part.text;
      continue;
    }
    if (part.type === "reasoning") {
      thinking += part.text;
      continue;
    }
    if (part.type.startsWith("tool-")) {
      const p = part as {
        type: string;
        toolCallId: string;
        state: string;
        input?: unknown;
        output?: unknown;
        errorText?: string;
      };
      toolCalls.push({
        id: p.toolCallId,
        name: p.type.slice("tool-".length),
        input: p.input,
        resultSummary:
          p.state === "output-available"
            ? summarizeToolOutput(p.output)
            : p.state === "output-error"
              ? p.errorText
              : undefined,
        ok:
          p.state === "output-available"
            ? true
            : p.state === "output-error"
              ? false
              : undefined,
        status:
          p.state === "output-available" || p.state === "output-error"
            ? "done"
            : "running",
      });
      continue;
    }
    if (part.type === "data-plan") {
      const data = (part as { data?: { todos?: PlanTodo[] } }).data;
      if (data?.todos?.length) todos = data.todos;
    }
  }

  let executionSteps: UiChatMessage["executionSteps"];
  if (todos?.length) {
    executionSteps = reduceExecutionMap(createExecutionMap(), { type: "plan", todos });
    if (!opts.streaming) {
      executionSteps = reduceExecutionMap(executionSteps, { type: "finish" });
    }
  }

  return {
    id: message.id,
    role: message.role as UiChatMessage["role"],
    content,
    ...(thinking ? { thinking } : {}),
    ...(toolCalls.length ? { toolCalls } : {}),
    ...(executionSteps ? { executionSteps } : {}),
    ...(opts.streaming ? { streaming: true } : {}),
  };
}
