/**
 * Compact long session history for the gateway context window.
 * Never splits an assistant tool_calls message from its tool results.
 */

import type { Message } from "@/lib/agent/types";

/** Soft cap: if history exceeds this many messages, compact older blocks. */
export const DEFAULT_COMPACT_MAX_MESSAGES = 48;
/** Always keep at least this many recent messages intact. */
export const DEFAULT_COMPACT_KEEP_RECENT = 28;

export type MessageBlock = Message[];

/**
 * Group messages so tool call chains stay atomic.
 * Block = consecutive messages that must not be split:
 * - assistant with toolCalls + following tool results
 * - otherwise single message
 */
export function groupMessageBlocks(messages: Message[]): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i]!;
    if (m.role === "assistant" && m.toolCalls?.length) {
      const block: Message[] = [m];
      i += 1;
      const needed = new Set(m.toolCalls.map((t) => t.id));
      while (i < messages.length && needed.size > 0) {
        const next = messages[i]!;
        if (next.role === "tool" && next.toolCallId && needed.has(next.toolCallId)) {
          block.push(next);
          needed.delete(next.toolCallId);
          i += 1;
          continue;
        }
        // Incomplete chain — still keep what we have as one block
        break;
      }
      blocks.push(block);
      continue;
    }
    blocks.push([m]);
    i += 1;
  }
  return blocks;
}

function summarizeBlock(block: MessageBlock): string {
  const parts: string[] = [];
  for (const m of block) {
    if (m.role === "user") {
      const t = m.content.replace(/\s+/g, " ").trim();
      parts.push(`用户: ${t.slice(0, 120)}${t.length > 120 ? "…" : ""}`);
    } else if (m.role === "assistant") {
      const t = m.content.replace(/\s+/g, " ").trim();
      if (t) {
        parts.push(`助手: ${t.slice(0, 120)}${t.length > 120 ? "…" : ""}`);
      } else if (m.toolCalls?.length) {
        parts.push(
          `助手: 调用 ${m.toolCalls.map((c) => c.name).join(", ")}`,
        );
      }
    } else if (m.role === "tool") {
      parts.push(`工具结果: ${m.content.slice(0, 60)}…`);
    }
  }
  return parts.join(" | ");
}

/**
 * If messages are over maxMessages, collapse oldest blocks into one system note
 * and keep the newest keepRecent messages (block-aligned).
 */
export function compactMessagesForGateway(
  messages: Message[],
  opts?: { maxMessages?: number; keepRecent?: number; sessionId?: string },
): Message[] {
  const maxMessages = opts?.maxMessages ?? DEFAULT_COMPACT_MAX_MESSAGES;
  const keepRecent = opts?.keepRecent ?? DEFAULT_COMPACT_KEEP_RECENT;
  if (messages.length <= maxMessages) return messages;

  const blocks = groupMessageBlocks(messages);
  // Take trailing blocks until we have ~keepRecent messages
  const kept: MessageBlock[] = [];
  let keptCount = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (keptCount > 0 && keptCount + b.length > keepRecent) break;
    kept.unshift(b);
    keptCount += b.length;
  }

  const keptSet = new Set(kept.flat().map((m) => m.id));
  const dropped = messages.filter((m) => !keptSet.has(m.id));
  if (!dropped.length) return messages;

  const lines = groupMessageBlocks(dropped)
    .slice(0, 20)
    .map((b) => `- ${summarizeBlock(b)}`);

  const summary: Message = {
    id: `compact-${dropped[0]?.id ?? "x"}`,
    sessionId: opts?.sessionId ?? dropped[0]?.sessionId ?? "",
    role: "system",
    content: [
      "<system-reminder>",
      "Earlier conversation was compacted to save context. Summary of older turns:",
      ...lines,
      "Prefer recent messages and tools for current work. Re-read artifacts if needed.",
      "</system-reminder>",
    ].join("\n"),
    createdAt: dropped[0]?.createdAt ?? new Date().toISOString(),
  };

  return [summary, ...kept.flat()];
}
