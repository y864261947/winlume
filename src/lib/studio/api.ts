/**
 * Browser-side Studio API helpers.
 * Authentication is supplied by the HttpOnly Auth.js session cookie.
 */

import type {
  AgentSseEvent,
  Artifact,
  Message,
  Project,
  Session,
} from "@/lib/agent/types";

const PENDING_FIRST_MESSAGE_KEY = "winlume:pending-first-message";

export function withUserHeaders(headers?: HeadersInit): Headers {
  const next = new Headers(headers);
  if (!next.has("content-type")) next.set("content-type", "application/json");
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

export async function listSessions(projectId?: string): Promise<Session[]> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  const response = await fetch(`/api/sessions${query}`, {
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
  projectId?: string;
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

/* ── Projects ─────────────────────────────────────────────── */

export async function listProjects(): Promise<Project[]> {
  const response = await fetch("/api/projects", {
    headers: withUserHeaders(),
    credentials: "same-origin",
  });
  if (response.status === 401) throw new StudioApiError("请先登录", 401);
  if (!response.ok) {
    const body = await parseJson<{ error?: string }>(response).catch(() => ({}));
    throw new StudioApiError(
      (body as { error?: string }).error || "加载项目列表失败",
      response.status,
    );
  }
  const data = await parseJson<{ projects?: Project[] }>(response);
  return Array.isArray(data.projects) ? data.projects : [];
}

export async function createProject(input: {
  name: string;
  description?: string;
  instructions?: string;
  pinnedSkillIds?: string[];
}): Promise<Project> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: withUserHeaders(),
    body: JSON.stringify(input),
    credentials: "same-origin",
  });
  if (response.status === 401) throw new StudioApiError("请先登录", 401);
  if (!response.ok) {
    const body = await parseJson<{ error?: string }>(response).catch(() => ({}));
    throw new StudioApiError(
      (body as { error?: string }).error || "创建项目失败",
      response.status,
    );
  }
  return parseJson<Project>(response);
}

export async function getProject(id: string): Promise<Project> {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    headers: withUserHeaders(),
    credentials: "same-origin",
  });
  if (response.status === 401) throw new StudioApiError("请先登录", 401);
  if (response.status === 404) throw new StudioApiError("项目不存在", 404);
  if (!response.ok) {
    const body = await parseJson<{ error?: string }>(response).catch(() => ({}));
    throw new StudioApiError(
      (body as { error?: string }).error || "加载项目失败",
      response.status,
    );
  }
  const data = await parseJson<{ project?: Project } | Project>(response);
  return "project" in data && data.project ? data.project : (data as Project);
}

export async function patchProject(
  id: string,
  patch: Partial<Pick<Project, "name" | "description" | "instructions" | "pinnedSkillIds">>,
): Promise<Project> {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: withUserHeaders(),
    body: JSON.stringify(patch),
    credentials: "same-origin",
  });
  if (response.status === 401) throw new StudioApiError("请先登录", 401);
  if (response.status === 404) throw new StudioApiError("项目不存在", 404);
  if (!response.ok) {
    const body = await parseJson<{ error?: string }>(response).catch(() => ({}));
    throw new StudioApiError(
      (body as { error?: string }).error || "更新项目失败",
      response.status,
    );
  }
  return parseJson<Project>(response);
}

export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: withUserHeaders(),
    credentials: "same-origin",
  });
  if (response.status === 401) throw new StudioApiError("请先登录", 401);
  if (response.status === 404) throw new StudioApiError("项目不存在", 404);
  if (!response.ok) {
    const body = await parseJson<{ error?: string }>(response).catch(() => ({}));
    throw new StudioApiError(
      (body as { error?: string }).error || "删除项目失败",
      response.status,
    );
  }
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

/** PATCH /api/sessions/[id] — title, model, and/or pinnedSkillIds (replace entire pin list). */
export async function patchSession(
  id: string,
  patch: {
    title?: string;
    model?: string;
    projectId?: string | null;
    pinnedSkillIds?: string[];
  },
): Promise<Session> {
  const response = await fetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: withUserHeaders(),
    body: JSON.stringify(patch),
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
      (body as { error?: string }).error || "更新会话失败",
      response.status,
    );
  }
  return parseJson<Session>(response);
}

export type ChatRequestBody = {
  sessionId?: string;
  message: string;
  model?: string;
  executionMode?: "studio" | "ai-sdk" | "codex";
  skillIds?: string[];
  /** Image artifact ids the user @-referenced in the composer. */
  referencedArtifactIds?: string[];
  /** @deprecated Use referencedArtifactIds */
  referencedArtifactId?: string;
};

/** Explicit server-side stop (disconnect alone does not cancel generation). */
export async function stopChatTurn(sessionId: string): Promise<void> {
  const response = await fetch("/api/chat/stop", {
    method: "POST",
    headers: withUserHeaders(),
    body: JSON.stringify({ sessionId }),
    credentials: "same-origin",
  });
  if (response.status === 401) {
    throw new StudioApiError("请先登录", 401);
  }
  // 404 / no active turn — still OK for idempotent stop
  if (!response.ok && response.status !== 404) {
    const body = await parseJson<{ error?: string }>(response).catch(() => ({}));
    throw new StudioApiError(
      (body as { error?: string }).error || "停止失败",
      response.status,
    );
  }
}

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

  if (response.status === 409) {
    throw new StudioApiError(
      "该会话已有进行中的回复，请稍候或点击停止后再发送",
      409,
    );
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

export type UploadImageArtifactBody = {
  sessionId: string;
  name: string;
  dataUrl: string;
  visibility?: "hidden";
  purpose?: "annotation";
};

/** Persist an uploaded image as a ready Artifact. */
export async function uploadImageArtifact(
  body: UploadImageArtifactBody,
): Promise<Artifact> {
  const response = await fetch("/api/artifacts/upload-image", {
    method: "POST",
    headers: withUserHeaders(),
    body: JSON.stringify(body),
    credentials: "same-origin",
  });

  if (response.status === 401) {
    throw new StudioApiError("请先登录", 401);
  }
  if (!response.ok) {
    const errBody = await parseJson<{ error?: string }>(response).catch(() => ({}));
    throw new StudioApiError(
      (errBody as { error?: string }).error || "图片上传失败",
      response.status,
    );
  }

  const data = await parseJson<{ artifact: Artifact }>(response);
  return data.artifact;
}

/** Persist a marked image as an internal targeting reference for refinement. */
export async function uploadImageAnnotation(body: {
  sessionId: string;
  name: string;
  dataUrl: string;
}): Promise<Artifact> {
  return uploadImageArtifact({
    ...body,
    visibility: "hidden",
    purpose: "annotation",
  });
}

/* ── Artifacts ─────────────────────────────────────────────── */

export async function listArtifacts(sessionId?: string): Promise<Artifact[]> {
  const qs = sessionId
    ? `?sessionId=${encodeURIComponent(sessionId)}`
    : "";
  const response = await fetch(`/api/artifacts${qs}`, {
    headers: withUserHeaders(),
    credentials: "same-origin",
  });
  if (response.status === 401) {
    throw new StudioApiError("请先登录", 401);
  }
  if (!response.ok) {
    const body = await parseJson<{ error?: string }>(response).catch(() => ({}));
    throw new StudioApiError(
      (body as { error?: string }).error || "加载作品列表失败",
      response.status,
    );
  }
  const data = await parseJson<{ artifacts: Artifact[] }>(response);
  return data.artifacts ?? [];
}

export async function getArtifact(
  id: string,
): Promise<{ artifact: Artifact; content: string | null }> {
  const response = await fetch(`/api/artifacts/${encodeURIComponent(id)}`, {
    headers: withUserHeaders(),
    credentials: "same-origin",
  });
  if (response.status === 401) {
    throw new StudioApiError("请先登录", 401);
  }
  if (response.status === 404) {
    throw new StudioApiError("作品不存在", 404);
  }
  if (!response.ok) {
    const body = await parseJson<{ error?: string }>(response).catch(() => ({}));
    throw new StudioApiError(
      (body as { error?: string }).error || "读取作品失败",
      response.status,
    );
  }
  return parseJson<{ artifact: Artifact; content: string | null }>(response);
}

/* ── First-message handoff (home → session page) ───────────── */

export type PendingFirstMessage = {
  sessionId: string;
  message: string;
  model?: string;
  /** Per-message skill ids; injected into system prompt on send. */
  skillIds?: string[];
  /** Image artifact ids @-mentioned in the first message. */
  referencedArtifactIds?: string[];
  /**
   * Session snapshot from createSession — lets /studio/c/[id] paint chrome
   * on the first client frame without waiting for getSessionBundle.
   */
  session?: Session;
};

export function setPendingFirstMessage(payload: PendingFirstMessage): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(
    PENDING_FIRST_MESSAGE_KEY,
    JSON.stringify(payload),
  );
}

/**
 * Synchronous client bootstrap for the session route.
 * Safe to call from useState initializers (window-gated).
 */
export function readHandoffBootstrap(sessionId: string): {
  message: string;
  model?: string;
  skillIds?: string[];
  referencedArtifactIds?: string[];
  session: Session | null;
  userMessage: Message;
} | null {
  if (!sessionId || typeof window === "undefined") return null;
  const pending = readPendingFirstMessage(sessionId);
  if (!pending?.message?.trim()) return null;
  return {
    message: pending.message,
    model: pending.model,
    skillIds: pending.skillIds,
    referencedArtifactIds: pending.referencedArtifactIds,
    session: pending.session ?? null,
    userMessage: {
      id: `pending-user-${sessionId}`,
      sessionId,
      role: "user",
      content: pending.message,
      createdAt: new Date().toISOString(),
    },
  };
}

function readPendingFirstMessage(
  sessionId: string,
): PendingFirstMessage | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PENDING_FIRST_MESSAGE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as PendingFirstMessage;
    if (data.sessionId !== sessionId || !data.message?.trim()) return null;
    return data;
  } catch {
    return null;
  }
}

/** Peek without consuming — used for optimistic chat UI during session load. */
export function peekPendingFirstMessage(
  sessionId: string,
): PendingFirstMessage | null {
  return readPendingFirstMessage(sessionId);
}

export function takePendingFirstMessage(
  sessionId: string,
): PendingFirstMessage | null {
  const data = readPendingFirstMessage(sessionId);
  if (!data) {
    // Clear corrupt / mismatched payload
    if (typeof window !== "undefined") {
      const raw = window.sessionStorage.getItem(PENDING_FIRST_MESSAGE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as PendingFirstMessage;
          if (parsed.sessionId === sessionId) {
            window.sessionStorage.removeItem(PENDING_FIRST_MESSAGE_KEY);
          }
        } catch {
          window.sessionStorage.removeItem(PENDING_FIRST_MESSAGE_KEY);
        }
      }
    }
    return null;
  }
  window.sessionStorage.removeItem(PENDING_FIRST_MESSAGE_KEY);
  return data;
}
