"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type SetStateAction,
} from "react";
import type { Message } from "@/lib/agent/types";
import {
  bindLiveChatHooks,
  clearLiveChatError,
  clearLiveChatQueue,
  emptyLiveChatSnapshot,
  getLiveChatSnapshot,
  MAX_MESSAGE_QUEUE_SIZE,
  removeLiveChatQueueItem,
  seedLiveChatFromServer,
  sendLiveChat,
  setLiveChatMessages,
  setLiveChatModel,
  stopLiveChat,
  subscribeLiveChat,
  type ArtifactEventPayload,
  type LiveChatSnapshot,
  type QueuedMessage,
  type StreamPhase,
  type UiChatMessage,
  type UiToolCall,
} from "@/lib/studio/live-chat-session";
import { FALLBACK_DEFAULT_MODEL } from "@/lib/studio/prefs";

export { MAX_MESSAGE_QUEUE_SIZE };
export type {
  ArtifactEventPayload,
  QueuedMessage,
  StreamPhase,
  UiChatMessage,
  UiToolCall,
};
export type { ExecutionStep } from "@/lib/studio/execution-map";

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
  setMessages: React.Dispatch<SetStateAction<UiChatMessage[]>>;
  /**
   * Send immediately, or enqueue when a turn is already streaming.
   * Returns `"sent" | "queued" | "rejected"`.
   */
  send: (
    text: string,
    overrides?: {
      model?: string;
      skillIds?: string[];
      referencedArtifactIds?: string[];
      referencedArtifactId?: string;
    },
  ) => Promise<"sent" | "queued" | "rejected">;
  stop: () => void;
  clearError: () => void;
  /** Pending turns waiting for the current stream to finish. */
  queue: QueuedMessage[];
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
};

/**
 * Studio chat hook backed by a session-scoped live store.
 * Leaving the page does not abort generation — return to resume the UI.
 */
export function useStudioChat(
  options: UseStudioChatOptions = {},
): UseStudioChatResult {
  const {
    sessionId: sessionIdProp = null,
    initialMessages,
    model: modelProp = FALLBACK_DEFAULT_MODEL,
    skillIds: skillIdsProp,
    onSession,
    onUnauthorized,
    onArtifact,
  } = options;

  const sessionId = sessionIdProp;

  // Keep UI hooks current while this page is mounted (stream may outlive mount).
  useEffect(() => {
    if (!sessionId) return;
    return bindLiveChatHooks(sessionId, {
      onArtifact,
      onUnauthorized,
      onSession,
    });
  }, [sessionId, onArtifact, onUnauthorized, onSession]);

  // Seed from server history — never clobbers an in-flight live turn.
  useEffect(() => {
    if (!sessionId) return;
    if (initialMessages) {
      seedLiveChatFromServer(sessionId, initialMessages, modelProp);
    } else if (modelProp) {
      setLiveChatModel(sessionId, modelProp);
    }
  }, [sessionId, initialMessages, modelProp]);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!sessionId) return () => {};
      return subscribeLiveChat(sessionId, onStoreChange);
    },
    [sessionId],
  );

  const getSnapshot = useCallback((): LiveChatSnapshot => {
    if (!sessionId) return emptyLiveChatSnapshot();
    return getLiveChatSnapshot(sessionId);
  }, [sessionId]);

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setModel = useCallback(
    (model: string) => {
      if (!sessionId) return;
      setLiveChatModel(sessionId, model);
    },
    [sessionId],
  );

  const setMessages = useCallback(
    (update: SetStateAction<UiChatMessage[]>) => {
      if (!sessionId) return;
      setLiveChatMessages(sessionId, update);
    },
    [sessionId],
  );

  const send = useCallback(
    async (
      text: string,
      overrides?: {
        model?: string;
        skillIds?: string[];
        referencedArtifactIds?: string[];
        referencedArtifactId?: string;
      },
    ): Promise<"sent" | "queued" | "rejected"> => {
      if (!sessionId) return "rejected";
      // Turn-only skillIds from composer; fall back to hook prop if any.
      const skillIds = overrides?.skillIds ?? skillIdsProp;
      return sendLiveChat(sessionId, text, {
        ...overrides,
        skillIds,
      });
    },
    [sessionId, skillIdsProp],
  );

  const stop = useCallback(() => {
    if (!sessionId) return;
    stopLiveChat(sessionId);
  }, [sessionId]);

  const clearError = useCallback(() => {
    if (!sessionId) return;
    clearLiveChatError(sessionId);
  }, [sessionId]);

  const removeFromQueue = useCallback(
    (id: string) => {
      if (!sessionId) return;
      removeLiveChatQueueItem(sessionId, id);
    },
    [sessionId],
  );

  const clearQueue = useCallback(() => {
    if (!sessionId) return;
    clearLiveChatQueue(sessionId);
  }, [sessionId]);

  return useMemo(
    () => ({
      sessionId,
      messages: snapshot.messages,
      streaming: snapshot.streaming,
      error: snapshot.error,
      model: snapshot.model || modelProp || FALLBACK_DEFAULT_MODEL,
      setModel,
      setMessages,
      send,
      stop,
      clearError,
      queue: snapshot.queue,
      removeFromQueue,
      clearQueue,
    }),
    [
      sessionId,
      snapshot.messages,
      snapshot.streaming,
      snapshot.error,
      snapshot.model,
      snapshot.queue,
      modelProp,
      setModel,
      setMessages,
      send,
      stop,
      clearError,
      removeFromQueue,
      clearQueue,
    ],
  );
}
