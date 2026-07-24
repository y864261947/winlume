/**
 * Browser-side Studio API helpers.
 * Always attach x-winlume-user from localStorage (winlume:gateway-user-id).
 */

import type { AgentSseEvent, Message, Session } from "@/lib/agent/types";

export const GATEWAY_USER_STORAGE_KEY = "winlume:gateway-user-id";

const PENDING_FIRST_MESSAGE_KEY = "winlume:pending-first-message";

export function getGatewayUserId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(GATEWAY_USER_STORAGE_KEY);
}

export function withUserHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  const userId = getGatewayUserId();
  if (userId) next.set("x-winlume-user", userId);
  if (!next.has("content-type")) {
    next.set("content-type", "application/json");
  }
  return next;
}

export class StudioApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "StudioApiError";
    this.status = status;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    throw new StudioApiError("服务没有返回内容", response.status);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new StudioApiError("服务返回了无法识别的数据", response.status);
  }
}

export async function listSessions(): Promise<Session[]> {
  const response = await fetch("/api/sessions", {
    headers: withUserHeaders(),
    credentials: "same-origin",
  });
  if (response.status === 401) {
    throw new StudioApiError("请先登录", 401);
  }
  if (!response.ok) {
    const body = await parseJson<{ error?: string }>(response).catch(() => ({}));
    throw new StudioApiError(
      (body as { error?: string }).error || "加载会话列表失败",
      response.status,
    );
  }
  const data = await parseJson<{ sessions: Session[] }>(response);
  return data.sessions ?? [];
}

export async function createSession(input?: {
  model?: string;
  title?: string;
}): Promise<Session> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: withUserHeaders(),
    body: JSON.stringify(input ?? {}),
    credentials: "same-origin",
  });
  if (response.status === 401) {
    throw new StudioApiError("请先登录", 401);
  }
  if (!response.ok) {
    const body = await parseJson<{ error?: string }>(response).catch(() => ({}));
    throw new StudioApiError(
      (body as { error?: string }).error || "创建会话失败",
      response.status,
    );
  }
  return parseJson<Session>(response);
}

export async function getSessionBundle(sessionId: string): Promise<{
  session: Session;
  messages: Message[];
}> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    headers: withUserHeaders(),
    credentials: "same-origin",
  });
  if (response.status === 401) {
    throw new StudioApiError("请先登录", 401);
  }
  if (response.status === 404) {
    throw new StudioApiError("会话不存在", 404);
  }
  if (!response.ok) {
    const body = await parseJson<{ error?: string }>(response).catch(() => ({}));
    throw new StudioApiError(
      (body as { error?: string }).error || "加载会话失败",
      response.status,
    );
  }
  return parseJson<{ session: Session; messages: Message[] }>(response);
}

export type ChatRequestBody = {
  sessionId?: string;
  message: string;
  model?: string;
  skillIds?: string[];
};

/**
 * POST /api/chat and parse SSE AgentSseEvent frames.
 * Calls onEvent for each event; throws on non-OK HTTP (before stream).
 */
export async function streamChat(
  body: ChatRequestBody,
  opts: {
    signal?: AbortSignal;
    onEvent: (event: AgentSseEvent) => void;
  },
): Promise<void> {
  const userId = getGatewayUserId();
  if (!userId) {
    throw new StudioApiError("请先登录", 401);
  }

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: withUserHeaders(),
    body: JSON.stringify(body),
    credentials: "same-origin",
    signal: opts.signal,
  });

  if (response.status === 401) {
    throw new StudioApiError("请先登录", 401);
  }

  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    try {
      const errBody = (await response.json()) as { error?: string };
      if (errBody.error) message = errBody.error;
    } catch {
      /* ignore */
    }
    throw new StudioApiError(message, response.status);
  }

  if (!response.body) {
    throw new StudioApiError("响应没有可读流", 500);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consume = (raw: string) => {
    // Normalize CRLF
    const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const parts = normalized.split("\n\n");
    // Last part may be incomplete
    const complete = parts.slice(0, -1);
    const rest = parts[parts.length - 1] ?? "";
    for (const block of complete) {
      for (const line of block.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).replace(/^ /, "").trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const event = JSON.parse(payload) as AgentSseEvent;
          opts.onEvent(event);
        } catch {
          /* skip malformed frame */
        }
      }
    }
    return rest;
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = consume(buffer);
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      // Final frame without trailing blank line
      buffer = consume(buffer.endsWith("\n\n") ? buffer : `${buffer}\n\n`);
    }
  } finally {
    reader.releaseLock();
  }
}

/* ── First-message handoff (home → session page) ───────────── */

export type PendingFirstMessage = {
  sessionId: string;
  message: string;
  model?: string;
  /** Prefill from Skills page; Task 7 will inject on send. */
  skillIds?: string[];
};

export function setPendingFirstMessage(payload: PendingFirstMessage): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    PENDING_FIRST_MESSAGE_KEY,
    JSON.stringify(payload),
  );
}

export function takePendingFirstMessage(
  sessionId: string,
): PendingFirstMessage | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PENDING_FIRST_MESSAGE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as PendingFirstMessage;
    if (data.sessionId !== sessionId || !data.message?.trim()) return null;
    window.sessionStorage.removeItem(PENDING_FIRST_MESSAGE_KEY);
    return data;
  } catch {
    window.sessionStorage.removeItem(PENDING_FIRST_MESSAGE_KEY);
    return null;
  }
}
