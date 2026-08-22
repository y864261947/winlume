"use client";

/**
 * Canonical Studio chat hook built on `@ai-sdk/react`'s
 * `useChat` + the server's AI SDK UI message stream and the
 * `/api/runs/[id]/stream` reconnect endpoint.
 *
 * Production Studio chat is owned by this hook. Server runs are durable, but
 * the browser has one source of truth: the AI SDK chat state below.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { z } from "zod";
import type { Message } from "@/lib/agent/types";
import { FALLBACK_DEFAULT_MODEL } from "@/lib/studio/prefs";
import { messagesToStudioUIMessage, type StudioUIMessage } from "@/lib/studio/ui-message-adapter";
import {
  buildIdempotencyHeaders,
  buildReconnectApi,
  buildSendRequestBody,
  findReusableOptimisticUserMessageId,
} from "@/lib/studio/v2-transport";
import { stopChatTurn } from "@/lib/studio/api";
import type {
  ArtifactEventPayload,
  StudioChatOptions,
  StudioChatResult,
  StudioPreparedTurn,
  StudioQueuedMessage,
  StudioSendOverrides,
} from "./studio-chat-types";
import { MAX_MESSAGE_QUEUE_SIZE } from "./studio-chat-types";

function clientId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function textPart(text: string) {
  return [{ type: "text" as const, text }];
}

function trimMessagesForActiveRun(messages: Message[], activeMessage: string): Message[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user" && message.content === activeMessage) {
      return messages.slice(0, index + 1);
    }
  }
  return messages;
}

export type UseStudioChatResult = StudioChatResult;

export function useStudioChat(
  options: StudioChatOptions = {},
): UseStudioChatResult {
  const {
    sessionId = null,
    initialMessages,
    model: modelProp = FALLBACK_DEFAULT_MODEL,
    skillIds: skillIdsProp,
    onSession,
    onUnauthorized,
    onArtifact,
    onFinish: onChatFinish,
    activeRun = null,
  } = options;

  const [model, setModelState] = useState(modelProp);
  const [queue, setQueue] = useState<StudioQueuedMessage[]>([]);
  const lastRunIdRef = useRef<string | null>(activeRun?.id ?? null);
  const lastCursorRef = useRef(0);
  const resumeStartedRef = useRef<string | null>(null);
  const lastFinishRef = useRef<{ isDisconnect: boolean; isError: boolean } | null>(null);

  const prepareReconnect = useCallback(
    () => ({
      api: buildReconnectApi(lastRunIdRef.current, lastCursorRef.current),
    }),
    [],
  );
  const transport = useMemo(
    () =>
      // The reconnect callback executes only when AI SDK opens a reconnect
      // request; it does not read the refs while this transport is created.
      // eslint-disable-next-line react-hooks/refs
      new DefaultChatTransport<StudioUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id, messages, body, messageId }) => ({
          body: buildSendRequestBody(id, messages, body),
          headers: buildIdempotencyHeaders(messages, messageId),
        }),
        prepareReconnectToStreamRequest: prepareReconnect,
      }),
    [prepareReconnect],
  );

  const {
    id,
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    stop: stopChat,
    clearError,
    resumeStream,
    regenerate,
  } = useChat<StudioUIMessage>({
    id: sessionId ?? undefined,
    transport,
    // Resume is triggered after the durable session bundle has hydrated. The
    // explicit effect below prevents useChat from racing the initial messages.
    resume: false,
    throttle: 32,
    messageMetadataSchema: z
      .object({
        model: z.string().optional(),
        skillIds: z.array(z.string()).optional(),
        thinkingDurationSec: z.number().optional(),
        preparing: z
          .object({
            label: z.string(),
            startedAt: z.number(),
            failed: z.boolean().optional(),
          })
          .optional(),
      }),
    dataPartSchemas: {
      plan: z.object({
        todos: z.array(
          z.object({
            id: z.string(),
            content: z.string(),
            status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
          }),
        ),
      }),
      artifact: z.object({
        artifactId: z.string(),
        name: z.string(),
        kind: z.string(),
      }),
      draft: z.object({ name: z.string().optional(), text: z.string() }),
      "tool-log": z.object({ text: z.string() }),
      error: z.object({ code: z.string() }),
      run: z.object({ runId: z.string(), status: z.string().optional() }),
      "run-cursor": z.object({
        runId: z.string(),
        sequence: z.number(),
        eventType: z.string().optional(),
        messageId: z.string().optional(),
      }),
      session: z.object({ sessionId: z.string() }),
    },
    onData: (part) => {
      if (part.type === "data-run") {
        const data = part.data as { runId?: string };
        if (data.runId) lastRunIdRef.current = data.runId;
        return;
      }
      if (part.type === "data-run-cursor") {
        const data = part.data as {
          runId?: string;
          sequence?: number;
          eventType?: string;
        };
        if (data.runId) lastRunIdRef.current = data.runId;
        // AI SDK resume starts a fresh streaming state. Reconnect from the
        // current assistant round's `message_start`, not from the last token,
        // so the SDK receives the start/text/reasoning framing it needs.
        if (data.eventType === "message_start" && typeof data.sequence === "number") {
          lastCursorRef.current = Math.max(0, data.sequence - 1);
        }
        return;
      }
      if (part.type === "data-session") {
        const data = part.data as { sessionId?: string };
        if (data.sessionId) onSession?.(data.sessionId);
        return;
      }
      if (part.type === "data-artifact") {
        const data = part.data as ArtifactEventPayload;
        if (data.artifactId) onArtifact?.(data);
        return;
      }
    },
    onFinish: ({ isDisconnect, isError }) => {
      lastFinishRef.current = { isDisconnect, isError };
      // A disconnected stream still owns a durable run and must be resumed;
      // completed or failed runs no longer need the session-level active hint.
      if (!isDisconnect) onChatFinish?.();
    },
    onError: (err) => {
      if (err.message.includes("401")) onUnauthorized?.();
    },
  });

  useEffect(() => {
    // Mirror the controlled model prop when the session selection changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModelState(modelProp);
  }, [modelProp]);

  useEffect(() => {
    const nextRunId = activeRun?.id ?? null;
    if (lastRunIdRef.current !== nextRunId) {
      lastCursorRef.current = 0;
      resumeStartedRef.current = null;
    }
    lastRunIdRef.current = nextRunId;
  }, [activeRun]);

  const streaming = status === "submitted" || status === "streaming";

  // Read inside the effect via a ref, NOT as a dependency — depending on
  // `streaming` directly would re-run this effect on every submitted/
  // streaming/ready transition, including the one that fires the instant a
  // turn finishes. The page only calls setInitialMessages at a few discrete
  // moments (initial load, auth recovery, or an explicit run refresh) and
  // never again once a turn completes, so `initialMessages` is stale at that
  // point — re-running here would wipe the just-finished reply straight off
  // the still-mounted useChat state it lives in.
  const streamingRef = useRef(streaming);
  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  // Reconcile with server history on every `initialMessages` change. The page
  // can refresh the session after login or when a run finishes, and each of
  // those updates needs to reach the chat. Server data is authoritative
  // whenever nothing is actively streaming (the server persists message parts,
  // so there is no ephemeral detail to preserve); skip only while
  // a turn is in flight so this can't clobber a live stream mid-response.
  useEffect(() => {
    if (!sessionId || !initialMessages || streamingRef.current) return;
    const hydrated = activeRun
      ? trimMessagesForActiveRun(initialMessages, activeRun.message)
      : initialMessages;
    setMessages(messagesToStudioUIMessage(hydrated));
    if (activeRun && resumeStartedRef.current !== activeRun.id) {
      resumeStartedRef.current = activeRun.id;
      void Promise.resolve().then(() => resumeStream());
    }
  }, [sessionId, initialMessages, activeRun, setMessages, resumeStream]);

  const doSend = useCallback(
    async (text: string, overrides?: StudioSendOverrides): Promise<"sent" | "rejected"> => {
      if (!sessionId) return "rejected";
      lastFinishRef.current = null;
      await sendMessage(
        { text },
        {
          body: {
            model: overrides?.model ?? model,
            skillIds: overrides?.skillIds ?? skillIdsProp,
            capabilityPresetId: overrides?.capabilityPresetId,
            composerOptions: overrides?.composerOptions,
            referencedArtifactIds: overrides?.referencedArtifactIds,
            referencedArtifactId: overrides?.referencedArtifactId,
            projectId: overrides?.projectId,
            bootstrap: overrides?.bootstrap,
          },
        },
      );
      return "sent";
    },
    [sessionId, sendMessage, model, skillIdsProp],
  );

  // Drain the queue once the previous turn finishes — useChat has no
  // built-in send queue (sendAutomaticallyWhen is for tool-continuation,
  // not this), so this keeps queue behavior local to the AI SDK hook.
  useEffect(() => {
    if (streaming || queue.length === 0) return;
    const [next, ...rest] = queue;
    if (!next) return;
    // Queue draining is an external event transition: remove the item before
    // starting its request so a re-render cannot submit it twice.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQueue(rest);
    void doSend(next.content, {
      model: next.model,
      capabilityPresetId: next.capabilityPresetId,
      composerOptions: next.composerOptions,
      skillIds: next.skillIds,
      referencedArtifactIds: next.referencedArtifactIds,
      referencedArtifactId: next.referencedArtifactId,
    });
  }, [streaming, queue, doSend]);

  const send = useCallback(
    async (
      text: string,
      overrides?: StudioSendOverrides,
    ): Promise<"sent" | "queued" | "rejected"> => {
      if (!sessionId) return "rejected";
      if (streaming) {
        if (queue.length >= MAX_MESSAGE_QUEUE_SIZE) return "rejected";
        setQueue((q) => [
          ...q,
          { id: clientId("queued"), content: text, ...overrides, createdAt: Date.now() },
        ]);
        return "queued";
      }
      return doSend(text, overrides);
    },
    [sessionId, streaming, queue.length, doSend],
  );

  const prepare = useCallback(
    (text: string, label = "正在处理…"): StudioPreparedTurn | null => {
      if (!sessionId || streaming) return null;
      const turnId = clientId("turn");
      const placeholderId = clientId("assistant-preparing");
      const startedAt = Date.now();
      let userMessageId = clientId("user");

      // metadata.preparing is this hook's private wire format for the
      // "waiting on preflight before the real turn starts" placeholder —
      // The placeholder stays in the canonical message list until preflight
      // completes, then the server stream replaces it with the real turn.
      const placeholderMessage = (): StudioUIMessage =>
        ({
          id: placeholderId,
          role: "assistant",
          parts: [],
          metadata: { preparing: { label, startedAt } },
        }) as StudioUIMessage;

      setMessages((prev) => {
        const reusableId = findReusableOptimisticUserMessageId(prev, text);
        if (reusableId) {
          userMessageId = reusableId;
          return [...prev, placeholderMessage()];
        }
        return [
          ...prev,
          { id: userMessageId, role: "user", parts: textPart(text) } as StudioUIMessage,
          placeholderMessage(),
        ];
      });

      const setStatus = (nextLabel: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? ({ ...m, metadata: { preparing: { label: nextLabel, startedAt } } } as StudioUIMessage)
              : m,
          ),
        );
      };

      const fail = (message: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? ({
                  ...m,
                  parts: [],
                  metadata: {
                    preparing: { label: message, startedAt, failed: true },
                  },
                } as StudioUIMessage)
              : m,
          ),
        );
      };

      const commit = async (
        commitText: string,
        overrides?: StudioSendOverrides,
      ): Promise<"sent" | "rejected"> => {
        // The server mints its own assistant id via the `start` chunk —
        // drop the local placeholder so it doesn't linger as a duplicate.
        setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
        lastFinishRef.current = null;
        await sendMessage(
          { text: commitText, messageId: userMessageId },
          {
            body: {
              model: overrides?.model ?? model,
              skillIds: overrides?.skillIds ?? skillIdsProp,
              capabilityPresetId: overrides?.capabilityPresetId,
              composerOptions: overrides?.composerOptions,
              referencedArtifactIds: overrides?.referencedArtifactIds,
              referencedArtifactId: overrides?.referencedArtifactId,
              projectId: overrides?.projectId,
              bootstrap: overrides?.bootstrap,
            },
          },
        );
        return "sent";
      };

      return { id: turnId, setStatus, fail, commit };
    },
    [sessionId, streaming, setMessages, sendMessage, model, skillIdsProp],
  );

  const removeFromQueue = useCallback((queuedId: string) => {
    setQueue((q) => q.filter((item) => item.id !== queuedId));
  }, []);

  const clearQueue = useCallback(() => setQueue([]), []);

  const retryError = useCallback(async () => {
    if (lastFinishRef.current?.isDisconnect && lastRunIdRef.current) {
      await resumeStream();
      lastFinishRef.current = null;
      onChatFinish?.();
      return;
    }
    let lastAssistantId: string | undefined;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "assistant") {
        lastAssistantId = messages[index]?.id;
        break;
      }
    }
    await regenerate(lastAssistantId ? { messageId: lastAssistantId } : {});
    lastFinishRef.current = null;
  }, [messages, onChatFinish, regenerate, resumeStream]);

  const stop = useCallback(() => {
    // `useChat().stop()` only closes the browser connection. The durable run
    // must also be cancelled explicitly so a later reconnect cannot resume a
    // generation the user intentionally stopped.
    lastFinishRef.current = null;
    if (sessionId) {
      void stopChatTurn(sessionId)
        .catch(() => {
          // The local stop still gives immediate feedback when the network is
          // unavailable; the next session refresh reconciles server state.
        })
        .finally(() => onChatFinish?.());
    }
    stopChat();
  }, [onChatFinish, sessionId, stopChat]);

  return {
    sessionId: id ?? sessionId,
    messages,
    streaming,
    error: error?.message ?? null,
    model,
    setModel: setModelState,
    setMessages,
    send,
    prepare,
    stop,
    clearError,
    retryError,
    resumeStream,
    regenerate,
    queue,
    removeFromQueue,
    clearQueue,
  };
}
