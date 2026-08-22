/**
 * SSE framing for the AI SDK UIMessageChunk protocol used by the Studio chat
 * POST and durable-run reconnect routes.
 */

import type { RunEvent, RunStatus } from "@/lib/agent/infrastructure";
import type { AgentSseEvent } from "@/lib/agent/types";

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
