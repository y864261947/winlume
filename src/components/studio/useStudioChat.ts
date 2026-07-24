"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentSseEvent,
  ArtifactKind,
  Message,
  Role,
} from "@/lib/agent/types";
import {
  getGatewayUserId,
  streamChat,
  StudioApiError,
} from "@/lib/studio/api";

export type UiChatMessage = {
  id: string;
  role: Role;
  content: string;
  streaming?: boolean;
};

function toUiMessages(messages: Message[]): UiChatMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
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
  send: (text: string, overrides?: { model?: string; skillIds?: string[] }) => Promise<void>;
  stop: () => void;
  clearError: () => void;
};

export function useStudioChat(options: UseStudioChatOptions = {}): UseStudioChatResult {
  const {
    sessionId: sessionIdProp = null,
    initialMessages,
    model: modelProp = "gpt-4o-mini",
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

  const abortRef = useRef<AbortController | null>(null);
  const onSessionRef = useRef(onSession);
  const onUnauthorizedRef = useRef(onUnauthorized);
  const onArtifactRef = useRef(onArtifact);
  const skillIdsRef = useRef(skillIdsProp);
  const sessionIdRef = useRef(sessionId);

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
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const send = useCallback(
    async (
      text: string,
      overrides?: { model?: string; skillIds?: string[] },
    ) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      if (abortRef.current) {
        // Ignore double-send while a turn is in flight
        return;
      }

      if (!getGatewayUserId()) {
        setError("请先登录后再发送消息");
        onUnauthorizedRef.current?.();
        return;
      }

      setError(null);
      const userMsg: UiChatMessage = {
        id: clientId("user"),
        role: "user",
        content: trimmed,
      };
      const assistantId = clientId("assistant");
      const assistantMsg: UiChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const requestModel = overrides?.model?.trim() || model;
      const requestSkillIds = overrides?.skillIds ?? skillIdsRef.current;

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
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + event.text, streaming: true }
                      : m,
                  ),
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
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId ? { ...m, streaming: false } : m,
                  ),
                );
                if (event.reason === "cancelled") {
                  /* stop() already set streaming false */
                }
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
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, streaming: false } : m,
          ),
        );
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setStreaming(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.streaming ? { ...m, streaming: false } : m,
          ),
        );
      }
    },
    [model],
  );

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
  };
}
