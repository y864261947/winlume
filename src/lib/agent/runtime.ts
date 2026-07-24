/**
 * Agent turn runtime (no tools yet — Task 8).
 * Loads session history, streams the gateway, persists messages, yields AgentSseEvent.
 */

import { randomUUID } from "node:crypto";
import type { AgentSseEvent, Message } from "@/lib/agent/types";
import type { SessionStore } from "@/lib/host/ports";
import {
  streamGatewayChat,
  type GatewayChatMessage,
} from "@/lib/agent/provider/gateway";

/** Fixed studio system policy (zh/en short). Skills injected per turn later (Task 7). */
export const BASE_POLICY = [
  "You are the WinLume Studio agent — a free-form assistant for writing, coding, analysis, and structured deliverables.",
  "Prefer clear, structured, helpful answers. Match the user's language (Chinese-first when the user writes in Chinese).",
  "When tools are available, prefer write_artifact for long documents or durable outputs instead of dumping huge walls of text in chat.",
  "Do not claim tools or capabilities that are not available in this turn.",
  "Respect any skill instructions attached to the current user message.",
].join(" ");

/**
 * Skill injection stub (Task 7). Accepts skillIds and returns empty system addendum for now.
 */
export function injectSkills(_skillIds?: string[]): string {
  return "";
}

function nowIso(): string {
  return new Date().toISOString();
}

function titleFromUserText(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (!oneLine) return "新对话";
  return oneLine.length > 40 ? `${oneLine.slice(0, 40)}…` : oneLine;
}

function toGatewayMessages(
  system: string,
  history: Message[],
): GatewayChatMessage[] {
  const out: GatewayChatMessage[] = [{ role: "system", content: system }];
  for (const m of history) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      // Tool results not sent until Task 8
      continue;
    }
    out.push({
      role: m.role,
      content: m.content,
    });
  }
  return out;
}

export interface RunAgentTurnOpts {
  userId: string;
  sessionId: string;
  userText: string;
  skillIds?: string[];
  model?: string;
  sessions: SessionStore;
  signal?: AbortSignal;
  /** Forwarded to gateway as New-Api-User when set */
  gatewayUserId?: string;
}

/**
 * Run one user→assistant turn without tool loops.
 * Yields SSE events for the chat route.
 */
export async function* runAgentTurn(
  opts: RunAgentTurnOpts,
): AsyncGenerator<AgentSseEvent, void, undefined> {
  const { userId, sessionId, sessions, signal } = opts;
  const userText = opts.userText.trim();
  if (!userText) {
    yield { type: "error", message: "消息不能为空", code: "empty_message" };
    yield { type: "done", reason: "error" };
    return;
  }

  if (signal?.aborted) {
    yield { type: "done", reason: "cancelled" };
    return;
  }

  let session = await sessions.getSession(userId, sessionId);
  if (!session) {
    yield {
      type: "error",
      message: "会话不存在",
      code: "session_not_found",
    };
    yield { type: "done", reason: "error" };
    return;
  }

  const model =
    (typeof opts.model === "string" && opts.model.trim()) || session.model;
  if (model !== session.model) {
    session = await sessions.updateSession(userId, sessionId, { model });
  }

  const prior = await sessions.listMessages(userId, sessionId);
  const isFirstTurn = prior.length === 0;

  const userMessage: Message = {
    id: randomUUID(),
    sessionId,
    role: "user",
    content: userText,
    ...(opts.skillIds?.length ? { skillIds: opts.skillIds } : {}),
    createdAt: nowIso(),
  };

  await sessions.appendMessages(userId, sessionId, [userMessage]);

  if (isFirstTurn) {
    const title = titleFromUserText(userText);
    if (title !== session.title) {
      session = await sessions.updateSession(userId, sessionId, { title });
    }
  }

  yield { type: "session", sessionId };

  const skillAddendum = injectSkills(opts.skillIds);
  const system = skillAddendum
    ? `${BASE_POLICY}\n\n${skillAddendum}`
    : BASE_POLICY;

  const history = await sessions.listMessages(userId, sessionId);
  const gatewayMessages = toGatewayMessages(system, history);

  let assistantText = "";
  let sawError = false;
  let cancelled = false;

  try {
    for await (const chunk of streamGatewayChat({
      model,
      messages: gatewayMessages,
      userId: opts.gatewayUserId ?? userId,
      signal,
    })) {
      if (signal?.aborted) {
        cancelled = true;
        break;
      }

      if (chunk.kind === "text") {
        assistantText += chunk.text;
        yield { type: "text_delta", text: chunk.text };
        continue;
      }

      if (chunk.kind === "error") {
        sawError = true;
        yield { type: "error", message: chunk.message, code: "gateway_error" };
        break;
      }

      // tool_call_delta / tool_calls: ignored until Task 8 (no tools loop)
    }
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
      cancelled = true;
    } else {
      sawError = true;
      const message =
        err instanceof Error ? err.message : "Agent turn failed unexpectedly";
      yield { type: "error", message, code: "runtime_error" };
    }
  }

  if (signal?.aborted) cancelled = true;

  // Persist assistant message when we have any text (including partial on cancel)
  if (assistantText) {
    const assistantMessage: Message = {
      id: randomUUID(),
      sessionId,
      role: "assistant",
      content: assistantText,
      createdAt: nowIso(),
    };
    await sessions.appendMessages(userId, sessionId, [assistantMessage]);
  } else if (sawError && !cancelled) {
    // No content — still finish with error reason
  }

  if (cancelled) {
    yield { type: "done", reason: "cancelled" };
  } else if (sawError) {
    yield { type: "done", reason: "error" };
  } else {
    yield { type: "done", reason: "completed" };
  }
}
