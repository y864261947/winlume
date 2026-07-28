"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentSseEvent,
  ArtifactKind,
  Message,
  Role,
} from "@/lib/agent/types";
import {
  streamChat,
  StudioApiError,
} from "@/lib/studio/api";
import { FALLBACK_DEFAULT_MODEL } from "@/lib/studio/prefs";

/** Max pending user turns while a stream is in flight (NewMax: MAX_QUEUE_SIZE = 5). */
export const MAX_MESSAGE_QUEUE_SIZE = 5;

export type UiToolCall = {
  id: string;
  name: string;
  input?: unknown;
  resultSummary?: string;
  ok?: boolean;
  status: "running" | "done";
};

/**
 * Stream activity phase — NewMax StreamingPulse phases (thinking / tooling / producing).
 * Inferred from SSE events even when the provider never emits raw "thinking" tokens.
 */
export type StreamPhase = "thinking" | "tool" | "producing" | "done";

export type UiChatMessage = {
  id: string;
  role: Role;
  content: string;
  streaming?: boolean;
  /** Accumulated model "thinking" deltas (if provider emits them). */
  thinking?: string;
  /** Tool calls attached to this assistant turn (NewMax tool-group style). */
  toolCalls?: UiToolCall[];
  /** Live / final activity phase for status UI. */
  streamPhase?: StreamPhase;
  /** Epoch ms when this assistant turn started streaming. */
  streamStartedAt?: number;
  /**
   * Seconds spent before first visible text (thinking + tools).
   * Mirrors NewMax thinkingSeconds on completed turns.
   */
  thinkingDurationSec?: number;
};

/** Queued outbound turn — mirrors NewMax message-queue item (stripped to web needs). */
export type QueuedMessage = {
  id: string;
  content: string;
  model?: string;
  skillIds?: string[];
  createdAt: number;
};

function toUiMessages(messages: Message[]): UiChatMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    toolCalls: m.toolCalls?.map((tc) => ({
      id: tc.id,
      name: tc.name,
      input: tc.arguments,
      resultSummary: tc.result,
      ok: tc.result !== undefined ? true : undefined,
      status: "done" as const,
    })),
  }));
}

function clientId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export type ArtifactEventPayload = {
  artifactId: string;
  name: string;
  kind: ArtifactKind;
};

export type UseStudioChatOptions = {
  sessionId?: string | null;
  initialMessages?: Message[];
  /** Default model for requests when not overridden per send */
  model?: string;
  skillIds?: string[];
  /** Called when server assigns/confirms a session id */
  onSession?: (sessionId: string) => void;
  /** Called when user is missing (401) so UI can open login */
  onUnauthorized?: () => void;
  /** Called when agent saves an artifact (SSE `artifact` event) */
  onArtifact?: (event: ArtifactEventPayload) => void;
};

export type UseStudioChatResult = {
  sessionId: string | null;
  messages: UiChatMessage[];
  streaming: boolean;
  error: string | null;
  model: string;
  setModel: (model: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<UiChatMessage[]>>;
  /**
   * Send immediately, or enqueue when a turn is already streaming.
   * Returns `"sent" | "queued" | "rejected"`.
   */
  send: (
    text: string,
    overrides?: { model?: string; skillIds?: string[] },
  ) => Promise<"sent" | "queued" | "rejected">;
  stop: () => void;
  clearError: () => void;
  /** Pending turns waiting for the current stream to finish. */
  queue: QueuedMessage[];
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
};

export function useStudioChat(options: UseStudioChatOptions = {}): UseStudioChatResult {
  const {
    sessionId: sessionIdProp = null,
    initialMessages,
    model: modelProp = FALLBACK_DEFAULT_MODEL,
    skillIds: skillIdsProp,
    onSession,
    onUnauthorized,
    onArtifact,
  } = options;

  const [sessionId, setSessionId] = useState<string | null>(sessionIdProp);
  const [messages, setMessages] = useState<UiChatMessage[]>(() =>
    initialMessages ? toUiMessages(initialMessages) : [],
  );
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState(modelProp);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const onSessionRef = useRef(onSession);
  const onUnauthorizedRef = useRef(onUnauthorized);
  const onArtifactRef = useRef(onArtifact);
  const skillIdsRef = useRef(skillIdsProp);
  const sessionIdRef = useRef(sessionId);
  const modelRef = useRef(model);
  const queueRef = useRef(queue);
  /** Prevent re-entrant drain while popping next queued item. */
  const drainingRef = useRef(false);
  const sendImplRef = useRef<
    | ((
        text: string,
        overrides?: { model?: string; skillIds?: string[] },
      ) => Promise<"sent" | "queued" | "rejected">)
    | null
  >(null);

  useEffect(() => {
    onSessionRef.current = onSession;
  }, [onSession]);
  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized;
  }, [onUnauthorized]);
  useEffect(() => {
    onArtifactRef.current = onArtifact;
  }, [onArtifact]);
  useEffect(() => {
    skillIdsRef.current = skillIdsProp;
  }, [skillIdsProp]);
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    modelRef.current = model;
  }, [model]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Sync when parent loads session bundle
  useEffect(() => {
    setSessionId(sessionIdProp);
  }, [sessionIdProp]);

  useEffect(() => {
    if (initialMessages) {
      setMessages(toUiMessages(initialMessages));
    }
  }, [initialMessages]);

  useEffect(() => {
    if (modelProp) setModel(modelProp);
  }, [modelProp]);

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
    // Keep queue; user can still clear or let it drain after a fresh send.
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const drainQueue = useCallback(() => {
    if (drainingRef.current) return;
    if (abortRef.current) return;
    const next = queueRef.current[0];
    if (!next) return;

    drainingRef.current = true;
    setQueue((prev) => prev.slice(1));
    // Defer so state settles; then fire next turn
    queueMicrotask(() => {
      drainingRef.current = false;
      void sendImplRef.current?.(next.content, {
        model: next.model,
        skillIds: next.skillIds,
      });
    });
  }, []);

  const runTurn = useCallback(
    async (
      text: string,
      overrides?: { model?: string; skillIds?: string[] },
    ): Promise<"sent" | "rejected"> => {
      const trimmed = text.trim();
      if (!trimmed) return "rejected";
      if (abortRef.current) return "rejected";

      setError(null);
      const userMsg: UiChatMessage = {
        id: clientId("user"),
        role: "user",
        content: trimmed,
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
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const requestModel =
        overrides?.model?.trim() || modelRef.current || model;
      const requestSkillIds = overrides?.skillIds ?? skillIdsRef.current;

      /** Seconds before first text token (NewMax thinkingSeconds). */
      let preTextMs: number | null = null;
      const markFirstText = () => {
        if (preTextMs == null) preTextMs = Date.now() - streamStartedAt;
      };

      const finalizeAssistant = (partial: Partial<UiChatMessage>) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
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
            };
          }),
        );
      };

      try {
        await streamChat(
          {
            ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
            message: trimmed,
            model: requestModel,
            ...(requestSkillIds?.length ? { skillIds: requestSkillIds } : {}),
          },
          {
            signal: controller.signal,
            onEvent: (event: AgentSseEvent) => {
              if (event.type === "session") {
                setSessionId(event.sessionId);
                sessionIdRef.current = event.sessionId;
                onSessionRef.current?.(event.sessionId);
                return;
              }
              if (event.type === "text_delta") {
                markFirstText();
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: m.content + event.text,
                          streaming: true,
                          streamPhase: "producing",
                        }
                      : m,
                  ),
                );
                return;
              }
              if (event.type === "thinking") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          thinking: (m.thinking ?? "") + event.text,
                          streaming: true,
                          streamPhase:
                            m.streamPhase === "producing" ? "producing" : "thinking",
                        }
                      : m,
                  ),
                );
                return;
              }
              if (event.type === "tool_call") {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
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
                    return {
                      ...m,
                      toolCalls,
                      streaming: true,
                      streamPhase: "tool",
                    };
                  }),
                );
                return;
              }
              if (event.type === "tool_result") {
                setMessages((prev) =>
                  prev.map((m) => {
                    if (m.id !== assistantId) return m;
                    const existing = m.toolCalls ?? [];
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
                    const stillRunning = toolCalls.some(
                      (t) => t.status === "running",
                    );
                    return {
                      ...m,
                      toolCalls,
                      streaming: true,
                      streamPhase: stillRunning
                        ? "tool"
                        : m.content
                          ? "producing"
                          : "thinking",
                    };
                  }),
                );
                return;
              }
              if (event.type === "artifact") {
                onArtifactRef.current?.({
                  artifactId: event.artifactId,
                  name: event.name,
                  kind: event.kind,
                });
                return;
              }
              if (event.type === "error") {
                setError(event.message);
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
          // user stopped
        } else if (err instanceof StudioApiError && err.status === 401) {
          setError(err.message);
          onUnauthorizedRef.current?.();
        } else if (err instanceof Error && err.name === "AbortError") {
          /* ignore */
        } else {
          const message =
            err instanceof Error ? err.message : "发送失败，请稍后重试";
          setError(message);
        }
        finalizeAssistant({});
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setStreaming(false);
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantId) return m;
            if (!m.streaming && m.streamPhase === "done") return m;
            const durationSec =
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
              streaming: false,
              streamPhase: "done",
              thinkingDurationSec: durationSec,
            };
          }),
        );
        // NewMax pattern: auto-drain queue when the turn finishes
        queueMicrotask(() => drainQueue());
      }

      return "sent";
    },
    [drainQueue, model],
  );

  const send = useCallback(
    async (
      text: string,
      overrides?: { model?: string; skillIds?: string[] },
    ): Promise<"sent" | "queued" | "rejected"> => {
      const trimmed = text.trim();
      if (!trimmed) return "rejected";

      // Streaming: enqueue (NewMax message queue)
      if (abortRef.current) {
        let queued = false;
        setQueue((prev) => {
          if (prev.length >= MAX_MESSAGE_QUEUE_SIZE) {
            queued = false;
            return prev;
          }
          queued = true;
          return [
            ...prev,
            {
              id: clientId("q"),
              content: trimmed,
              model: overrides?.model,
              skillIds: overrides?.skillIds,
              createdAt: Date.now(),
            },
          ];
        });
        if (!queued) {
          setError(`队列已满（最多 ${MAX_MESSAGE_QUEUE_SIZE} 条），请等待当前回复完成`);
          return "rejected";
        }
        return "queued";
      }

      return runTurn(trimmed, overrides);
    },
    [runTurn],
  );

  sendImplRef.current = send;

  return {
    sessionId,
    messages,
    streaming,
    error,
    model,
    setModel,
    setMessages,
    send,
    stop,
    clearError,
    queue,
    removeFromQueue,
    clearQueue,
  };
}
