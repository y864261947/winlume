/**
 * SSE framing shared by the legacy AgentSseEvent stream and the AI SDK
 * UIMessageChunk protocol (both `/api/chat`'s POST and the durable-run
 * reconnect GET speak this). Kept in one place so the two routes can't
 * silently drift on how a `RunEvent` becomes a client-visible event.
 */

import type { RunEvent, RunStatus } from "@/lib/agent/infrastructure";
import type { AgentSseEvent } from "@/lib/agent/types";

export function sseFrame(event: AgentSseEvent, sequence?: number): string {
  const id = sequence === undefined ? "" : `id: ${sequence}\n`;
  return `${id}data: ${JSON.stringify(event)}\n\n`;
}

/**
 * Frame one or more AI SDK UIMessageChunks under the same replay sequence.
 * Multiple chunks sharing one `id:` line is fine — the id is only our own
 * replay cursor, not required to be unique per SSE frame by EventSource.
 */
export function uiSseFrame(chunks: unknown[], sequence?: number): string {
  const id = sequence === undefined ? "" : `id: ${sequence}\n`;
  return chunks.map((chunk) => `${id}data: ${JSON.stringify(chunk)}\n\n`).join("");
}

export function isTerminalStatus(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function toClientEvent(runId: string, event: RunEvent): AgentSseEvent | null {
  if (event.type === "agent.event") return event.payload.event;
  if (event.type === "run.status_changed") {
    return { type: "run", runId, status: event.payload.to };
  }
  return null;
}
