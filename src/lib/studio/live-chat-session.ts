/**
 * Session-scoped live chat state that outlives page mounts.
 *
 * Navigating away from a streaming session must NOT abort the fetch —
 * otherwise partial assistant content vanishes and the server turn cancels.
 * This module keeps messages + the AbortController per sessionId so returning
 * to the conversation rehydrates the in-flight (or just-finished) turn.
 */

import type { AgentSseEvent, ArtifactKind, Message, Role } from "@/lib/agent/types";
import {
  createExecutionMap,
  reduceExecutionMap,
  type ExecutionStep,
} from "@/lib/studio/execution-map";
import { streamChat, stopChatTurn, StudioApiError } from "@/lib/studio/api";
import { FALLBACK_DEFAULT_MODEL } from "@/lib/studio/prefs";

export const MAX_MESSAGE_QUEUE_SIZE = 5;

export type UiToolCall = {
  id: string;
  name: string;
  input?: unknown;
  resultSummary?: string;
  ok?: boolean;
  status: "running" | "done";
};

export type StreamPhase = "thinking" | "tool" | "producing" | "done";

export type UiChatMessage = {
  id: string;
  role: Role;
  content: string;
  streaming?: boolean;
  thinking?: string;
  toolCalls?: UiToolCall[];
  streamPhase?: StreamPhase;
  streamStartedAt?: number;
  thinkingDurationSec?: number;
  artifactDraft?: { name?: string; text: string };
  executionSteps?: ExecutionStep[];
};

export type QueuedMessage = {
  id: string;
  content: string;
  model?: string;
  skillIds?: string[];
  createdAt: number;
};

export type ArtifactEventPayload = {
  artifactId: string;
  name: string;
  kind: ArtifactKind;
};

export type LiveChatSnapshot = {
  sessionId: string;
  messages: UiChatMessage[];
  streaming: boolean;
  error: string | null;
  queue: QueuedMessage[];
  model: string;
};

type UiHooks = {
  onArtifact?: (event: ArtifactEventPayload) => void;
  onUnauthorized?: () => void;
  onSession?: (sessionId: string) => void;
};

type Entry = {
  snapshot: LiveChatSnapshot;
  controller: AbortController | null;
  listeners: Set<() => void>;
  hooks: UiHooks;
  /** Serialize turn starts for this session (queue drain). */
  starting: boolean;
};

const entries = new Map<string, Entry>();

function clientId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Best-effort read of a persisted tool-role message's raw content (the
 * value the LLM sees, not the human `tool_result.summary` from the live SSE
 * stream — that string is never persisted). Only used to reconstruct a
 * result line for the reloaded/static view; falls back to the raw content.
 */
function summarizeToolContent(
  name: string,
  rawContent: string,
): { ok: boolean; summary: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch {
    return { ok: true, summary: rawContent };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: true, summary: rawContent };
  }
  const p = parsed as Record<string, unknown>;
  if (typeof p.error === "string") {
    return { ok: false, summary: p.error };
  }
  if (
    name === "write_artifact" &&
    typeof p.name === "string" &&
    typeof p.kind === "string" &&
    typeof p.chars === "number"
  ) {
    return {
      ok: true,
      summary: `Saved artifact "${p.name}" (id=${p.id ?? ""}, kind=${p.kind}, ${p.chars} chars)`,
    };
  }
  if ((name === "todo_write" || name === "declare_plan") && typeof p.summary === "string") {
    return { ok: true, summary: p.summary };
  }
  return { ok: true, summary: rawContent };
}

/**
 * Reconstructs the same folded view a live turn shows: each tool call's
 * result gets merged back onto its parent assistant message (matching what
 * `tool_result` does in-memory during streaming), and the standalone
 * tool-role receipt message — never rendered as its own bubble live — is
 * dropped so a reloaded session looks identical to the just-streamed one
 * instead of surfacing raw JSON receipts.
 */
export function toUiMessages(messages: Message[]): UiChatMessage[] {
  const callNameById = new Map<string, string>();
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls) {
      for (const tc of m.toolCalls) callNameById.set(tc.id, tc.name);
    }
  }
  const resultByCallId = new Map<string, { ok: boolean; summary: string }>();
  for (const m of messages) {
    if (m.role === "tool" && m.toolCallId) {
      const name = callNameById.get(m.toolCallId) ?? "tool";
      resultByCallId.set(m.toolCallId, summarizeToolContent(name, m.content));
    }
  }

  return messages
    .filter((m) => m.role !== "tool")
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls?.map((tc) => {
        const result = resultByCallId.get(tc.id);
        return {
          id: tc.id,
          name: tc.name,
          input: tc.arguments,
          resultSummary: result?.summary ?? tc.result,
          ok: result ? result.ok : tc.result !== undefined ? true : undefined,
          status: "done" as const,
        };
      }),
    }));
}

function ensureEntry(sessionId: string, model?: string): Entry {
  let entry = entries.get(sessionId);
  if (!entry) {
    entry = {
      snapshot: {
        sessionId,
        messages: [],
        streaming: false,
        error: null,
        queue: [],
        model: model?.trim() || FALLBACK_DEFAULT_MODEL,
      },
      controller: null,
      listeners: new Set(),
      hooks: {},
      starting: false,
    };
    entries.set(sessionId, entry);
  }
  return entry;
}

function emit(entry: Entry): void {
  // New snapshot reference so useSyncExternalStore sees a change.
  entry.snapshot = { ...entry.snapshot };
  for (const listener of entry.listeners) {
    try {
      listener();
    } catch {
      /* listener errors must not break the stream */
    }
  }
}

function patchSnapshot(
  entry: Entry,
  patch: Partial<LiveChatSnapshot> | ((prev: LiveChatSnapshot) => LiveChatSnapshot),
): void {
  entry.snapshot =
    typeof patch === "function"
      ? patch(entry.snapshot)
      : { ...entry.snapshot, ...patch };
  for (const listener of entry.listeners) {
    try {
      listener();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Always returns a stable snapshot reference for the session (creates entry if needed).
 * Required for useSyncExternalStore: same data ⇒ same object identity.
 */
export function getLiveChatSnapshot(sessionId: string): LiveChatSnapshot {
  return ensureEntry(sessionId).snapshot;
}

export function subscribeLiveChat(
  sessionId: string,
  listener: () => void,
): () => void {
  const entry = ensureEntry(sessionId);
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

/** Bind UI callbacks for the currently mounted session page (replaced on remount). */
export function bindLiveChatHooks(sessionId: string, hooks: UiHooks): () => void {
  const entry = ensureEntry(sessionId);
  entry.hooks = hooks;
  return () => {
    if (entries.get(sessionId)?.hooks === hooks) {
      entry.hooks = {};
    }
  };
}

export function setLiveChatModel(sessionId: string, model: string): void {
  const entry = ensureEntry(sessionId, model);
  if (entry.snapshot.model === model) return;
  patchSnapshot(entry, { model });
}

export function setLiveChatMessages(
  sessionId: string,
  update: UiChatMessage[] | ((prev: UiChatMessage[]) => UiChatMessage[]),
): void {
  const entry = ensureEntry(sessionId);
  const prev = entry.snapshot.messages;
  const next = typeof update === "function" ? update(prev) : update;
  patchSnapshot(entry, { messages: next });
}

export function clearLiveChatError(sessionId: string): void {
  const entry = entries.get(sessionId);
  if (!entry || entry.snapshot.error == null) return;
  patchSnapshot(entry, { error: null });
}

export function removeLiveChatQueueItem(sessionId: string, id: string): void {
  const entry = entries.get(sessionId);
  if (!entry) return;
  patchSnapshot(entry, {
    queue: entry.snapshot.queue.filter((q) => q.id !== id),
  });
}

export function clearLiveChatQueue(sessionId: string): void {
  const entry = entries.get(sessionId);
  if (!entry || entry.snapshot.queue.length === 0) return;
  patchSnapshot(entry, { queue: [] });
}

/**
 * Seed / reconcile with server history.
 * Never clobber an active stream or a richer live buffer (mid-generation leave).
 */
export function seedLiveChatFromServer(
  sessionId: string,
  serverMessages: Message[],
  model?: string,
): void {
  const entry = ensureEntry(sessionId, model);
  if (model?.trim() && entry.snapshot.model !== model.trim()) {
    entry.snapshot = { ...entry.snapshot, model: model.trim() };
  }

  if (entry.controller || entry.snapshot.streaming) {
    // Keep live progressive state; still refresh model if needed.
    emit(entry);
    return;
  }

  if (shouldPreferLiveMessages(entry.snapshot.messages, serverMessages)) {
    emit(entry);
    return;
  }

  patchSnapshot(entry, {
    messages: toUiMessages(serverMessages),
    error: entry.snapshot.error,
  });
}

function shouldPreferLiveMessages(
  live: UiChatMessage[],
  server: Message[],
): boolean {
  if (!live.length) return false;
  if (live.some((m) => m.streaming)) return true;

  // Live still has client-temp ids with content the server may not have returned yet.
  const liveHasTemp =
    live.some((m) => m.id.startsWith("user-") || m.id.startsWith("assistant-")) ||
    live.some((m) => m.id.startsWith("pending-user-"));

  if (!liveHasTemp) return false;

  const lastLiveAssistant = [...live].reverse().find((m) => m.role === "assistant");
  const lastServerAssistant = [...server]
    .reverse()
    .find((m) => m.role === "assistant");

  if (lastLiveAssistant?.content && !lastServerAssistant?.content) return true;
  if (
    lastLiveAssistant &&
    lastServerAssistant &&
    lastLiveAssistant.content.length > lastServerAssistant.content.length
  ) {
    return true;
  }

  // Live has more turns than server (user just sent, server lag).
  if (live.length > server.length) return true;

  return false;
}

export function stopLiveChat(sessionId: string): void {
  const entry = entries.get(sessionId);
  if (!entry) return;
  // Local reader abort + explicit server-side turn cancel
  entry.controller?.abort();
  entry.controller = null;
  void stopChatTurn(sessionId).catch(() => {
    /* offline / already stopped */
  });
  patchSnapshot(entry, {
    streaming: false,
    messages: entry.snapshot.messages.map((m) =>
      m.streaming
        ? {
            ...m,
            streaming: false,
            streamPhase: "done" as const,
            artifactDraft: undefined,
          }
        : m,
    ),
  });
}

export type SendOverrides = {
  model?: string;
  skillIds?: string[];
  /** Id of an image artifact the user @-referenced in the composer, if any. */
  referencedArtifactId?: string;
};

/**
 * Send a user turn, or enqueue if this session is already streaming.
 * Safe to call without a mounted React tree (queue drain after background finish).
 */
export async function sendLiveChat(
  sessionId: string,
  text: string,
  overrides?: SendOverrides,
): Promise<"sent" | "queued" | "rejected"> {
  const trimmed = text.trim();
  if (!trimmed || !sessionId) return "rejected";

  const entry = ensureEntry(sessionId);

  if (entry.controller || entry.snapshot.streaming) {
    if (entry.snapshot.queue.length >= MAX_MESSAGE_QUEUE_SIZE) {
      patchSnapshot(entry, {
        error: `队列已满（最多 ${MAX_MESSAGE_QUEUE_SIZE} 条），请等待当前回复完成`,
      });
      return "rejected";
    }
    patchSnapshot(entry, {
      queue: [
        ...entry.snapshot.queue,
        {
          id: clientId("q"),
          content: trimmed,
          model: overrides?.model,
          skillIds: overrides?.skillIds,
          createdAt: Date.now(),
        },
      ],
    });
    return "queued";
  }

  return runLiveTurn(sessionId, trimmed, overrides);
}

async function runLiveTurn(
  sessionId: string,
  text: string,
  overrides?: SendOverrides,
): Promise<"sent" | "rejected"> {
  const entry = ensureEntry(sessionId);
  if (entry.controller || entry.starting) return "rejected";

  entry.starting = true;
  try {
    const requestModel =
      overrides?.model?.trim() || entry.snapshot.model || FALLBACK_DEFAULT_MODEL;
    const requestSkillIds = overrides?.skillIds;
    const requestReferencedArtifactId = overrides?.referencedArtifactId;

    const userMsg: UiChatMessage = {
      id: clientId("user"),
      role: "user",
      content: text,
    };
    const assistantId = clientId("assistant");
    const streamStartedAt = Date.now();
    const assistantMsg: UiChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
      toolCalls: [],
      streamPhase: "thinking",
      streamStartedAt,
      executionSteps: createExecutionMap(),
    };

    const controller = new AbortController();
    entry.controller = controller;

    patchSnapshot(entry, {
      error: null,
      streaming: true,
      model: requestModel,
      messages: (() => {
        const prev = entry.snapshot.messages;
        const last = prev[prev.length - 1];
        const dropOptimistic =
          last?.role === "user" &&
          last.id.startsWith("pending-user-") &&
          last.content === text;
        const base = dropOptimistic ? prev.slice(0, -1) : prev;
        return [...base, userMsg, assistantMsg];
      })(),
    });

    let preTextMs: number | null = null;
    const markFirstText = () => {
      if (preTextMs == null) preTextMs = Date.now() - streamStartedAt;
    };

    const updateAssistant = (
      updater: (m: UiChatMessage) => UiChatMessage,
    ): void => {
      patchSnapshot(entry, {
        messages: entry.snapshot.messages.map((m) =>
          m.id === assistantId ? updater(m) : m,
        ),
      });
    };

    const finalizeAssistant = (partial: Partial<UiChatMessage> = {}): void => {
      updateAssistant((m) => {
        const durationSec =
          partial.thinkingDurationSec ??
          m.thinkingDurationSec ??
          (preTextMs != null
            ? Math.max(1, Math.round(preTextMs / 1000))
            : m.streamStartedAt
              ? Math.max(
                  1,
                  Math.round((Date.now() - m.streamStartedAt) / 1000),
                )
              : undefined);
        return {
          ...m,
          ...partial,
          streaming: false,
          streamPhase: "done",
          thinkingDurationSec: durationSec,
          artifactDraft: undefined,
          executionSteps: reduceExecutionMap(m.executionSteps, {
            type: "finish",
          }),
        };
      });
    };

    try {
      await streamChat(
        {
          sessionId,
          message: text,
          model: requestModel,
          ...(requestSkillIds?.length ? { skillIds: requestSkillIds } : {}),
          ...(requestReferencedArtifactId
            ? { referencedArtifactId: requestReferencedArtifactId }
            : {}),
        },
        {
          signal: controller.signal,
          onEvent: (event: AgentSseEvent) => {
            // Always read hooks from entry so remounted page receives events.
            const hooks = entry.hooks;

            if (event.type === "session") {
              hooks.onSession?.(event.sessionId);
              return;
            }
            if (event.type === "plan") {
              updateAssistant((m) => ({
                ...m,
                streaming: true,
                streamPhase:
                  m.streamPhase === "producing" ? "producing" : "tool",
                executionSteps: reduceExecutionMap(m.executionSteps, {
                  type: "plan",
                  todos: event.todos ?? [],
                  ...(event.steps?.length ? { steps: event.steps } : {}),
                }),
              }));
              return;
            }
            if (event.type === "text_delta") {
              markFirstText();
              updateAssistant((m) => ({
                ...m,
                content: m.content + event.text,
                streaming: true,
                streamPhase: "producing",
                executionSteps: reduceExecutionMap(m.executionSteps, {
                  type: "reply",
                }),
              }));
              return;
            }
            if (event.type === "thinking") {
              updateAssistant((m) => ({
                ...m,
                thinking: (m.thinking ?? "") + event.text,
                streaming: true,
                streamPhase:
                  m.streamPhase === "producing" ? "producing" : "thinking",
              }));
              return;
            }
            if (event.type === "tool_progress") {
              if (event.kind === "draft" && event.text != null) {
                updateAssistant((m) => ({
                  ...m,
                  streaming: true,
                  streamPhase: "tool",
                  artifactDraft: {
                    name: event.name ?? m.artifactDraft?.name,
                    text: event.text ?? "",
                  },
                  executionSteps: reduceExecutionMap(m.executionSteps, {
                    type: "writing",
                    name: event.name ?? m.artifactDraft?.name,
                  }),
                }));
              }
              // kind "text" reserved for future log lines
              return;
            }
            if (event.type === "artifact_draft") {
              updateAssistant((m) => ({
                ...m,
                streaming: true,
                streamPhase: "tool",
                artifactDraft: {
                  name: event.name ?? m.artifactDraft?.name,
                  text: event.text,
                },
                executionSteps: reduceExecutionMap(m.executionSteps, {
                  type: "writing",
                  name: event.name ?? m.artifactDraft?.name,
                }),
              }));
              return;
            }
            if (event.type === "tool_call") {
              updateAssistant((m) => {
                const existing = m.toolCalls ?? [];
                const idx = existing.findIndex((t) => t.id === event.id);
                const nextCall: UiToolCall = {
                  id: event.id,
                  name: event.name,
                  input: event.input,
                  status: "running",
                };
                const toolCalls =
                  idx >= 0
                    ? existing.map((t, i) =>
                        i === idx ? { ...t, ...nextCall } : t,
                      )
                    : [...existing, nextCall];
                const writeName =
                  event.name === "write_artifact" &&
                  event.input &&
                  typeof event.input === "object" &&
                  event.input !== null &&
                  "name" in event.input &&
                  typeof (event.input as { name?: unknown }).name === "string"
                    ? String((event.input as { name: string }).name)
                    : undefined;
                const label =
                  event.name === "write_artifact" && writeName
                    ? `写入「${writeName.slice(0, 14)}${writeName.length > 14 ? "…" : ""}」`
                    : undefined;
                return {
                  ...m,
                  toolCalls,
                  streaming: true,
                  streamPhase: "tool",
                  executionSteps: reduceExecutionMap(m.executionSteps, {
                    type: "tool_start",
                    callId: event.id,
                    toolName: event.name,
                    label,
                  }),
                };
              });
              return;
            }
            if (event.type === "tool_result") {
              updateAssistant((m) => {
                const existing = m.toolCalls ?? [];
                const matched = existing.find((t) => t.id === event.id);
                const toolName = matched?.name ?? "tool";
                const toolCalls = existing.map((t) =>
                  t.id === event.id
                    ? {
                        ...t,
                        resultSummary: event.summary,
                        ok: event.ok,
                        status: "done" as const,
                      }
                    : t,
                );
                if (!toolCalls.some((t) => t.id === event.id)) {
                  toolCalls.push({
                    id: event.id,
                    name: "tool",
                    resultSummary: event.summary,
                    ok: event.ok,
                    status: "done",
                  });
                }
                const stillRunning = toolCalls.some((t) => t.status === "running");
                const wrote = toolCalls.some(
                  (t) => t.name === "write_artifact" && t.status === "done",
                );
                let executionSteps = reduceExecutionMap(m.executionSteps, {
                  type: "tool_end",
                  callId: event.id,
                  toolName,
                  ok: event.ok,
                });
                if (!stillRunning && (m.content || wrote)) {
                  executionSteps = reduceExecutionMap(executionSteps, {
                    type: "reply",
                  });
                }
                return {
                  ...m,
                  toolCalls,
                  streaming: true,
                  streamPhase: stillRunning
                    ? "tool"
                    : m.content || wrote
                      ? "producing"
                      : "thinking",
                  executionSteps,
                };
              });
              return;
            }
            if (event.type === "artifact") {
              updateAssistant((m) => ({
                ...m,
                artifactDraft: m.artifactDraft
                  ? { name: event.name, text: m.artifactDraft.text }
                  : m.artifactDraft,
                executionSteps: reduceExecutionMap(m.executionSteps, {
                  type: "reply",
                }),
              }));
              hooks.onArtifact?.({
                artifactId: event.artifactId,
                name: event.name,
                kind: event.kind,
              });
              return;
            }
            if (event.type === "error") {
              patchSnapshot(entry, { error: event.message });
              return;
            }
            if (event.type === "done") {
              finalizeAssistant({});
            }
          },
        },
      );
    } catch (err) {
      if (controller.signal.aborted) {
        /* user stopped or intentional abort */
      } else if (err instanceof StudioApiError && err.status === 401) {
        patchSnapshot(entry, { error: err.message });
        entry.hooks.onUnauthorized?.();
      } else if (err instanceof Error && err.name === "AbortError") {
        /* ignore */
      } else {
        const message =
          err instanceof Error ? err.message : "发送失败，请稍后重试";
        patchSnapshot(entry, { error: message });
      }
      finalizeAssistant({});
    } finally {
      if (entry.controller === controller) {
        entry.controller = null;
      }
      // Ensure assistant closed even if stream ended without done event
      updateAssistant((m) => {
        if (!m.streaming && m.streamPhase === "done") return m;
        const durationSec =
          m.thinkingDurationSec ??
          (preTextMs != null
            ? Math.max(1, Math.round(preTextMs / 1000))
            : m.streamStartedAt
              ? Math.max(1, Math.round((Date.now() - m.streamStartedAt) / 1000))
              : undefined);
        return {
          ...m,
          streaming: false,
          streamPhase: "done",
          thinkingDurationSec: durationSec,
          artifactDraft: undefined,
          executionSteps: reduceExecutionMap(m.executionSteps, {
            type: "finish",
          }),
        };
      });
      patchSnapshot(entry, { streaming: false });
      queueMicrotask(() => {
        void drainQueue(sessionId);
      });
    }

    return "sent";
  } finally {
    entry.starting = false;
  }
}

async function drainQueue(sessionId: string): Promise<void> {
  const entry = entries.get(sessionId);
  if (!entry) return;
  if (entry.controller || entry.snapshot.streaming || entry.starting) return;
  const next = entry.snapshot.queue[0];
  if (!next) return;
  patchSnapshot(entry, { queue: entry.snapshot.queue.slice(1) });
  await runLiveTurn(sessionId, next.content, {
    model: next.model,
    skillIds: next.skillIds,
  });
}

/** Stable empty snapshot for hooks without a session id (SSR / invalid route). */
const EMPTY_SNAPSHOT: LiveChatSnapshot = {
  sessionId: "",
  messages: [],
  streaming: false,
  error: null,
  queue: [],
  model: FALLBACK_DEFAULT_MODEL,
};

export function emptyLiveChatSnapshot(): LiveChatSnapshot {
  return EMPTY_SNAPSHOT;
}
