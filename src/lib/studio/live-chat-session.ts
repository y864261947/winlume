/**
 * Session-scoped live chat state that outlives page mounts.
 *
 * Navigating away from a streaming session must NOT abort the fetch —
 * otherwise partial assistant content vanishes and the server turn cancels.
 * This module keeps messages + the AbortController per sessionId so returning
 * to the conversation rehydrates the in-flight (or just-finished) turn.
 */

import type {
  AgentSseEvent,
  Message,
  WorkflowRunIntent,
} from "@/lib/agent/types";
import { createExecutionMap } from "@/lib/studio/execution-map";
import {
  finalizeLiveAgentState,
  reduceLiveAgentEvent,
  type ArtifactEventPayload,
  type LiveAgentStreamState,
  type UiChatMessage,
} from "@/lib/studio/live-agent-events";
import {
  getRunEvents,
  streamChat,
  stopChatTurn,
  StudioApiError,
  type WorkflowRunEvent,
  type WorkflowRunEventsResult,
} from "@/lib/studio/api";
import { FALLBACK_DEFAULT_MODEL } from "@/lib/studio/prefs";
import { noteLiveChatBecameIdle } from "@/lib/studio/session-unread";

export type {
  ArtifactEventPayload,
  StreamPhase,
  UiChatMessage,
  UiToolCall,
} from "@/lib/studio/live-agent-events";

export const MAX_MESSAGE_QUEUE_SIZE = 5;

export type QueuedMessage = {
  id: string;
  content: string;
  model?: string;
  capabilityPresetId?: string;
  skillIds?: string[];
  referencedArtifactIds?: string[];
  /** @deprecated Use referencedArtifactIds */
  referencedArtifactId?: string;
  createdAt: number;
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
      ...(m.presentation ? { presentation: m.presentation } : {}),
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

function notifyIdleIfQuiet(sessionId: string, entry: Entry): void {
  if (entry.snapshot.streaming || entry.controller || entry.snapshot.queue.length > 0) {
    return;
  }
  noteLiveChatBecameIdle(sessionId);
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
  capabilityPresetId?: string;
  skillIds?: string[];
  referencedArtifactIds?: string[];
  /** @deprecated Use referencedArtifactIds */
  referencedArtifactId?: string;
};

export type WorkflowLiveStage = {
  workflowId: string;
  id: string;
  title: string;
  iteration: number;
  intent: WorkflowRunIntent;
};

export type WorkflowRunAttachment = {
  detach: () => void;
  terminal: Promise<"settled" | "detached">;
};

type ActiveWorkflowAttachment = {
  handle: WorkflowRunAttachment;
  controller: AbortController;
};

type WorkflowStreamMessages = {
  noticeId: string;
  assistantId: string;
  state: LiveAgentStreamState;
};

type WorkflowReplayState = {
  stream: WorkflowStreamMessages;
  state: LiveAgentStreamState;
  cursor: number;
};

const workflowAttachments = new Map<string, ActiveWorkflowAttachment>();
const workflowReplayStates = new Map<string, WorkflowReplayState>();

function createWorkflowAssistant(id = clientId("assistant")): UiChatMessage {
  return {
    id,
    role: "assistant",
    content: "",
    streaming: true,
    toolCalls: [],
    streamPhase: "thinking",
    streamStartedAt: Date.now(),
    executionSteps: createExecutionMap(),
  };
}

function appendWorkflowStreamMessages(
  entry: Entry,
  stage: WorkflowLiveStage,
  runId: string,
): WorkflowStreamMessages {
  const noticeId = clientId("workflow-run");
  const notice: UiChatMessage = {
    id: noticeId,
    role: "user",
    content: "",
    presentation: {
      kind: "workflow_run",
      workflowId: stage.workflowId,
      runId,
      stageId: stage.id,
      stageTitle: stage.title,
      iteration: stage.iteration,
      intent: stage.intent,
    },
  };
  const assistant = createWorkflowAssistant();
  patchSnapshot(entry, {
    error: null,
    streaming: true,
    messages: [...entry.snapshot.messages, notice, assistant],
  });
  return {
    noticeId,
    assistantId: assistant.id,
    state: { assistant, preTextMs: null },
  };
}

function resetWorkflowStreamMessages(
  entry: Entry,
  runId: string,
): WorkflowStreamMessages | null {
  const noticeIndex = entry.snapshot.messages.findIndex(
    (message) =>
      message.presentation?.kind === "workflow_run" &&
      message.presentation.runId === runId,
  );
  if (noticeIndex < 0) return null;
  const previousAssistant = entry.snapshot.messages[noticeIndex + 1];
  if (
    !previousAssistant ||
    previousAssistant.role !== "assistant"
  ) {
    return null;
  }

  const assistant = createWorkflowAssistant(previousAssistant.id);
  patchSnapshot(entry, {
    error: null,
    streaming: true,
    messages: entry.snapshot.messages.map((message) =>
      message.id === assistant.id ? assistant : message,
    ),
  });
  return {
    noticeId: entry.snapshot.messages[noticeIndex].id,
    assistantId: assistant.id,
    state: { assistant, preTextMs: null },
  };
}

function workflowAttachmentKey(sessionId: string, runId: string): string {
  return `${sessionId}\u0000${runId}`;
}

function runAgentEvent(event: WorkflowRunEvent): AgentSseEvent | null {
  if (event.type !== "agent.event") return null;
  if (!event.payload || typeof event.payload !== "object" || !("event" in event.payload)) {
    return null;
  }
  const agentEvent = event.payload.event;
  if (!agentEvent || typeof agentEvent !== "object" || !("type" in agentEvent)) {
    return null;
  }
  return agentEvent as AgentSseEvent;
}

function runIsSettled(status: WorkflowRunEventsResult["run"]["status"]): boolean {
  return status !== "queued" && status !== "running";
}

function abortableReplayDelay(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      globalThis.clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = globalThis.setTimeout(finish, 1_000);
    signal.addEventListener("abort", finish, { once: true });
  });
}

/** Replays one durable Run into the live store; detach never cancels the Run. */
export function attachWorkflowRun(
  sessionId: string,
  runId: string,
  stage: WorkflowLiveStage,
): WorkflowRunAttachment {
  const key = workflowAttachmentKey(sessionId, runId);
  const existing = workflowAttachments.get(key);
  if (existing) return existing.handle;

  const entry = ensureEntry(sessionId);
  let replayState = workflowReplayStates.get(key);
  if (!replayState) {
    const stream =
      resetWorkflowStreamMessages(entry, runId) ??
      appendWorkflowStreamMessages(entry, stage, runId);
    replayState = { stream, state: stream.state, cursor: 0 };
    workflowReplayStates.set(key, replayState);
  } else {
    patchSnapshot(entry, { error: null, streaming: true });
  }
  const stream = replayState.stream;
  const controller = new AbortController();
  let streamState = replayState.state;
  let cursor = replayState.cursor;
  let completed = false;
  let resolveTerminal!: (outcome: "settled" | "detached") => void;

  const terminal = new Promise<"settled" | "detached">((resolve) => {
    resolveTerminal = resolve;
  });
  const complete = (outcome: "settled" | "detached"): void => {
    if (completed) return;
    completed = true;
    if (workflowAttachments.get(key)?.handle === handle) {
      workflowAttachments.delete(key);
    }
    if (outcome === "settled") workflowReplayStates.delete(key);
    resolveTerminal(outcome);
  };
  const handle: WorkflowRunAttachment = {
    detach: () => {
      controller.abort();
      complete("detached");
    },
    terminal,
  };
  workflowAttachments.set(key, { handle, controller });

  const applyStreamState = (next: LiveAgentStreamState): void => {
    if (next === streamState) return;
    streamState = next;
    replayState.state = next;
    patchSnapshot(entry, {
      messages: entry.snapshot.messages.map((message) =>
        message.id === stream.assistantId ? next.assistant : message,
      ),
    });
  };
  const finalizeAttachment = (): void => {
    applyStreamState(finalizeLiveAgentState(streamState, Date.now()));
    patchSnapshot(entry, { streaming: false });
    notifyIdleIfQuiet(sessionId, entry);
  };

  void (async () => {
    while (!controller.signal.aborted && !completed) {
      let replay: WorkflowRunEventsResult;
      try {
        replay = await getRunEvents(runId, {
          after: cursor,
          signal: controller.signal,
        });
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
          return;
        }
        if (error instanceof StudioApiError && error.status === 401) {
          patchSnapshot(entry, { error: error.message });
          entry.hooks.onUnauthorized?.();
          finalizeAttachment();
          complete("settled");
          return;
        }
        if (error instanceof StudioApiError && error.status === 404) {
          patchSnapshot(entry, { error: error.message });
          finalizeAttachment();
          complete("settled");
          return;
        }
        patchSnapshot(entry, {
          error: error instanceof Error ? error.message : "恢复工作流运行失败",
        });
        await abortableReplayDelay(controller.signal);
        continue;
      }

      if (entry.snapshot.error) patchSnapshot(entry, { error: null });
      let advanced = false;
      for (const event of replay.events) {
        if (controller.signal.aborted || completed) return;
        if (event.sequence <= cursor) continue;
        cursor = event.sequence;
        replayState.cursor = cursor;
        advanced = true;
        const agentEvent = runAgentEvent(event);
        if (!agentEvent) continue;
        const reduced = reduceLiveAgentEvent(streamState, agentEvent, Date.now());
        applyStreamState(reduced.state);
        if (reduced.effects.artifact) {
          entry.hooks.onArtifact?.(reduced.effects.artifact);
        }
        if (reduced.effects.error) {
          patchSnapshot(entry, { error: reduced.effects.error.message });
        }
      }
      cursor = Math.max(cursor, replay.nextSequence);
      replayState.cursor = cursor;

      if (runIsSettled(replay.run.status)) {
        finalizeAttachment();
        complete("settled");
        return;
      }
      if (!advanced) await abortableReplayDelay(controller.signal);
    }
  })();

  return handle;
}

/** Starts the first Workflow Stage directly; it never enters the text queue. */
export async function startWorkflowLiveChat(
  sessionId: string,
  stage: WorkflowLiveStage,
): Promise<"sent" | "rejected"> {
  if (!sessionId) return "rejected";
  const entry = ensureEntry(sessionId);
  if (entry.controller || entry.snapshot.streaming || entry.starting) {
    return "rejected";
  }

  entry.starting = true;
  const controller = new AbortController();
  entry.controller = controller;
  const temporaryRunId = clientId("pending-run");
  const stream = appendWorkflowStreamMessages(entry, stage, temporaryRunId);
  let streamState = stream.state;

  const applyStreamState = (next: LiveAgentStreamState): void => {
    if (next === streamState) return;
    streamState = next;
    patchSnapshot(entry, {
      messages: entry.snapshot.messages.map((message) =>
        message.id === stream.assistantId ? next.assistant : message,
      ),
    });
  };
  const finalizeAssistant = (): void => {
    applyStreamState(finalizeLiveAgentState(streamState, Date.now()));
  };

  try {
    try {
      await streamChat(
        { sessionId, workflowAction: "start" },
        {
          signal: controller.signal,
          onEvent: (event: AgentSseEvent) => {
            const reduced = reduceLiveAgentEvent(streamState, event, Date.now());
            applyStreamState(reduced.state);
            const run = reduced.effects.run;
            if (run) {
              patchSnapshot(entry, {
                messages: entry.snapshot.messages.map((message) =>
                  message.id === stream.noticeId && message.presentation
                    ? {
                        ...message,
                        presentation: {
                          ...message.presentation,
                          runId: run.runId,
                        },
                      }
                    : message,
                ),
              });
            }
            if (reduced.effects.sessionId) {
              entry.hooks.onSession?.(reduced.effects.sessionId);
            }
            if (reduced.effects.artifact) {
              entry.hooks.onArtifact?.(reduced.effects.artifact);
            }
            if (reduced.effects.error) {
              patchSnapshot(entry, { error: reduced.effects.error.message });
            }
          },
        },
      );
    } catch (error) {
      if (controller.signal.aborted) {
        // Explicit stop already updates the shared snapshot.
      } else if (error instanceof StudioApiError && error.status === 401) {
        patchSnapshot(entry, { error: error.message });
        entry.hooks.onUnauthorized?.();
      } else if (!(error instanceof Error && error.name === "AbortError")) {
        patchSnapshot(entry, {
          error: error instanceof Error ? error.message : "启动工作流失败",
        });
      }
      finalizeAssistant();
    } finally {
      if (entry.controller === controller) entry.controller = null;
      finalizeAssistant();
      patchSnapshot(entry, { streaming: false });
      notifyIdleIfQuiet(sessionId, entry);
    }
    return "sent";
  } finally {
    entry.starting = false;
  }
}

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
          capabilityPresetId: overrides?.capabilityPresetId,
          skillIds: overrides?.skillIds,
          referencedArtifactIds: overrides?.referencedArtifactIds,
          referencedArtifactId: overrides?.referencedArtifactId,
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
    const requestCapabilityPresetId = overrides?.capabilityPresetId?.trim();
    const requestSkillIds = overrides?.skillIds;
    const requestReferencedArtifactIds = overrides?.referencedArtifactIds;
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

    let streamState: LiveAgentStreamState = {
      assistant: assistantMsg,
      preTextMs: null,
    };

    const applyStreamState = (next: LiveAgentStreamState): void => {
      if (next === streamState) return;
      streamState = next;
      patchSnapshot(entry, {
        messages: entry.snapshot.messages.map((m) =>
          m.id === assistantId ? next.assistant : m,
        ),
      });
    };

    const finalizeAssistant = (): void => {
      applyStreamState(finalizeLiveAgentState(streamState, Date.now()));
    };

    try {
      await streamChat(
        {
          sessionId,
          message: text,
          model: requestModel,
          ...(requestCapabilityPresetId
            ? { capabilityPresetId: requestCapabilityPresetId }
            : {}),
          ...(requestSkillIds?.length ? { skillIds: requestSkillIds } : {}),
          ...(requestReferencedArtifactIds?.length
            ? { referencedArtifactIds: requestReferencedArtifactIds }
            : {}),
          ...(requestReferencedArtifactId
            ? { referencedArtifactId: requestReferencedArtifactId }
            : {}),
        },
        {
          signal: controller.signal,
          onEvent: (event: AgentSseEvent) => {
            // Always read hooks from entry so remounted page receives events.
            const hooks = entry.hooks;
            const reduced = reduceLiveAgentEvent(streamState, event, Date.now());
            applyStreamState(reduced.state);
            if (reduced.effects.sessionId) {
              hooks.onSession?.(reduced.effects.sessionId);
            }
            if (reduced.effects.artifact) {
              hooks.onArtifact?.(reduced.effects.artifact);
            }
            if (reduced.effects.error) {
              patchSnapshot(entry, { error: reduced.effects.error.message });
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
      finalizeAssistant();
    } finally {
      if (entry.controller === controller) {
        entry.controller = null;
      }
      // Ensure assistant closed even if stream ended without done event
      finalizeAssistant();
      patchSnapshot(entry, { streaming: false });
      notifyIdleIfQuiet(sessionId, entry);
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
    capabilityPresetId: next.capabilityPresetId,
    skillIds: next.skillIds,
    referencedArtifactIds: next.referencedArtifactIds,
    referencedArtifactId: next.referencedArtifactId,
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
