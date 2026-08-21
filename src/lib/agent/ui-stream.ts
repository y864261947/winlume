/**
 * Pure `AgentSseEvent -> UIMessageChunk` translator (AI SDK's `ai` package
 * wire protocol). Stateful per assistant round because AI SDK requires
 * explicit start/end bracketing around streamed text/reasoning parts, while
 * `AgentSseEvent` only ever carries raw deltas.
 *
 * Not wired into any route yet — this is the Phase 2 groundwork the plan
 * calls for, kept side-by-side with the legacy `AgentSseEvent` SSE stream
 * that `/api/chat` still speaks by default.
 */

import type { UIMessageChunk } from "ai";
import type { AgentSseEvent } from "@/lib/agent/types";

export function createAgentEventTranslator(): (
  event: AgentSseEvent,
) => UIMessageChunk[] {
  let textId: string | null = null;
  let reasoningId: string | null = null;

  const closeOpenParts = (): UIMessageChunk[] => {
    const chunks: UIMessageChunk[] = [];
    if (reasoningId) {
      chunks.push({ type: "reasoning-end", id: reasoningId });
      reasoningId = null;
    }
    if (textId) {
      chunks.push({ type: "text-end", id: textId });
      textId = null;
    }
    return chunks;
  };

  return (event: AgentSseEvent): UIMessageChunk[] => {
    switch (event.type) {
      case "session":
        return [
          {
            type: "data-session",
            id: "session",
            data: { sessionId: event.sessionId },
            transient: true,
          },
        ];

      case "run":
        // Transient: control-plane status only (used client-side purely to
        // track the run id for reconnect). A non-transient data part gets
        // pushed into message.parts and written into the message list the
        // moment it arrives — since `run` events land before the `start`
        // chunk that establishes the real message id, that write would
        // otherwise plant an empty placeholder message ahead of the actual
        // response.
        return [
          {
            type: "data-run",
            id: "run",
            data: { runId: event.runId, status: event.status },
            transient: true,
          },
        ];

      case "message_start":
        // A new round always starts a fresh UI message boundary — the
        // runtime persists each tool-calling round as its own Message row,
        // so this maps 1:1 rather than needing start-step/finish-step.
        return [...closeOpenParts(), { type: "start", messageId: event.messageId }];

      case "text_delta": {
        const chunks: UIMessageChunk[] = [];
        if (reasoningId) {
          chunks.push({ type: "reasoning-end", id: reasoningId });
          reasoningId = null;
        }
        if (!textId) {
          textId = "text-0";
          chunks.push({ type: "text-start", id: textId });
        }
        chunks.push({ type: "text-delta", id: textId, delta: event.text });
        return chunks;
      }

      case "thinking": {
        const chunks: UIMessageChunk[] = [];
        if (!reasoningId) {
          reasoningId = "reasoning-0";
          chunks.push({ type: "reasoning-start", id: reasoningId });
        }
        chunks.push({ type: "reasoning-delta", id: reasoningId, delta: event.text });
        return chunks;
      }

      case "tool_call":
        return [
          {
            type: "tool-input-available",
            toolCallId: event.id,
            toolName: event.name,
            input: event.input,
          },
        ];

      case "tool_result":
        return event.ok
          ? [
              {
                type: "tool-output-available",
                toolCallId: event.id,
                output: { summary: event.summary, ok: true },
              },
            ]
          : [
              {
                type: "tool-output-error",
                toolCallId: event.id,
                errorText: event.summary,
              },
            ];

      case "tool_progress":
        // Full-snapshot payload (not a delta) — a reconciled-by-id data part
        // preserves that semantic instead of forcing it through
        // tool-input-delta's text-delta contract.
        return event.kind === "draft"
          ? [
              {
                type: "data-draft",
                id: event.id,
                data: { name: event.name, text: event.text ?? "" },
              },
            ]
          : [
              {
                type: "data-tool-log",
                id: event.id,
                data: { text: event.text ?? "" },
              },
            ];

      case "artifact_draft":
        // Deprecated duplicate of tool_progress{kind:"draft"}; dropped here.
        return [];

      case "artifact":
        return [
          {
            type: "data-artifact",
            id: event.artifactId,
            data: { artifactId: event.artifactId, name: event.name, kind: event.kind },
          },
        ];

      case "plan":
        return [{ type: "data-plan", id: "plan", data: { todos: event.todos } }];

      case "error":
        return [
          { type: "error", errorText: event.message },
          ...(event.code
            ? ([
                {
                  type: "data-error",
                  id: "error",
                  data: { code: event.code },
                  transient: true,
                },
              ] as UIMessageChunk[])
            : []),
        ];

      case "done": {
        const chunks = closeOpenParts();
        if (event.reason === "cancelled") {
          chunks.push({ type: "abort" });
        } else if (event.reason === "error") {
          chunks.push({ type: "finish", finishReason: "error" });
        } else {
          chunks.push({ type: "finish", finishReason: "stop" });
        }
        return chunks;
      }

      default:
        return [];
    }
  };
}
