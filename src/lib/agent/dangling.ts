/**
 * Repair assistant tool_calls that never received a matching tool role message.
 * Happens on cancel/abort mid-turn or process crash between rounds.
 */

import { randomUUID } from "node:crypto";
import type { Message } from "@/lib/agent/types";

export type DanglingToolCall = {
  id: string;
  name: string;
};

/**
 * Find tool call ids on assistant messages that lack a following tool result.
 */
export function findDanglingToolCalls(messages: Message[]): DanglingToolCall[] {
  const resultIds = new Set(
    messages
      .filter((m) => m.role === "tool" && m.toolCallId)
      .map((m) => m.toolCallId as string),
  );

  const dangling: DanglingToolCall[] = [];
  const seen = new Set<string>();

  for (const m of messages) {
    if (m.role !== "assistant" || !m.toolCalls?.length) continue;
    for (const tc of m.toolCalls) {
      if (!tc.id || resultIds.has(tc.id) || seen.has(tc.id)) continue;
      seen.add(tc.id);
      dangling.push({ id: tc.id, name: tc.name || "tool" });
    }
  }
  return dangling;
}

export function buildRepairToolMessages(
  sessionId: string,
  dangling: DanglingToolCall[],
  reason: "cancelled" | "interrupted" | "repaired" = "repaired",
): Message[] {
  const createdAt = new Date().toISOString();
  const label =
    reason === "cancelled"
      ? "Tool call cancelled by user."
      : reason === "interrupted"
        ? "Tool call interrupted before completion."
        : "Tool call completed without a result; repaired for continuity.";

  return dangling.map((d) => ({
    id: randomUUID(),
    sessionId,
    role: "tool" as const,
    content: JSON.stringify({
      ok: false,
      cancelled: reason === "cancelled",
      error: label,
      tool: d.name,
    }),
    toolCallId: d.id,
    createdAt,
  }));
}

/**
 * Append synthetic tool results for any dangling calls in history.
 * Returns the number of repairs written.
 */
export async function repairDanglingInStore(
  sessions: {
    listMessages: (userId: string, sessionId: string) => Promise<Message[]>;
    appendMessages: (
      userId: string,
      sessionId: string,
      messages: Message[],
    ) => Promise<void>;
  },
  userId: string,
  sessionId: string,
  reason: "cancelled" | "interrupted" | "repaired" = "repaired",
): Promise<number> {
  const messages = await sessions.listMessages(userId, sessionId);
  const dangling = findDanglingToolCalls(messages);
  if (!dangling.length) return 0;
  await sessions.appendMessages(
    userId,
    sessionId,
    buildRepairToolMessages(sessionId, dangling, reason),
  );
  return dangling.length;
}
