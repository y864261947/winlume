"use client";

/**
 * AI-SDK-backed alternative to `useStudioChat`. Built on `@ai-sdk/react`'s
 * `useChat` + the server's `?protocol=ui` stream and the
 * `/api/runs/[id]/stream` reconnect endpoint.
 *
 * `UseStudioChatResult`'s shape is matched exactly, so this is a drop-in
 * swap for `useStudioChat` at any call site. Workflow methods delegate
 * straight to `live-chat-session.ts`'s workflow subsystem (same as the
 * legacy hook) — it's orthogonal to the useChat message stream this hook
 * otherwise owns, so it keeps working unchanged.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { Message } from "@/lib/agent/types";
import { FALLBACK_DEFAULT_MODEL } from "@/lib/studio/prefs";
import { uiMessageToChatMessage } from "@/lib/studio/ui-message-adapter";
import {
  buildIdempotencyHeaders,
  buildReconnectApi,
  buildSendRequestBody,
  findReusableOptimisticUserMessageId,
} from "@/lib/studio/v2-transport";
import {
  attachWorkflowRun as attachWorkflowRunStore,
  MAX_MESSAGE_QUEUE_SIZE,
  startWorkflowLiveChat,
  stopLiveChat,
  type QueuedMessage,
} from "@/lib/studio/live-chat-session";
import type {
  ArtifactEventPayload,
  UiChatMessage,
} from "@/lib/studio/live-agent-events";
import type {
  PreparedLiveChatTurn,
  WorkflowLiveStage,
  WorkflowRunAttachment,
} from "@/lib/studio/live-chat-session";
import type { UseStudioChatOptions, UseStudioChatResult } from "./useStudioChat";

function clientId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function textPart(text: string) {
  return [{ type: "text" as const, text }];
}

function messageToUIMessage(m: Message): UIMessage {
  // Prefer the parts persisted since Phase 1 (reasoning/tool/plan detail) —
  // our local UIMessagePart union is a structural subset of AI SDK's, so
  // this is a safe widen. Older messages that predate that schema change
  // fall back to a bare text part.
  const parts = m.parts?.length ? m.parts : textPart(m.content);
  return {
    id: m.id,
    role: m.role as UIMessage["role"],
    parts: parts as UIMessage["parts"],
    ...(m.metadata ? { metadata: m.metadata } : {}),
  } as UIMessage;
}

type SendOverrides = {
  model?: string;
  capabilityPresetId?: string;
  skillIds?: string[];
  referencedArtifactIds?: string[];
  referencedArtifactId?: string;
  projectId?: string;
  bootstrap?: { title?: string };
};

export type UseStudioChatV2Result = UseStudioChatResult & {
  /** Raw AI SDK messages (with .parts), for callers that want full fidelity
   *  instead of the lossy UiChatMessage adapter — e.g. rendering with AI
   *  Elements' Reasoning/Tool components directly. */
  rawMessages: UIMessage[];
};

export function useStudioChatV2(
  options: UseStudioChatOptions = {},
): UseStudioChatV2Result {
  const {
    sessionId = null,
    initialMessages,
    model: modelProp = FALLBACK_DEFAULT_MODEL,
    skillIds: skillIdsProp,
    onSession,
    onUnauthorized,
    onArtifact,
  } = options;

  const [model, setModelState] = useState(modelProp);
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const lastRunIdRef = useRef<string | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat?protocol=ui",
        prepareSendMessagesRequest: ({ id, messages, body, messageId }) => ({
          body: buildSendRequestBody(id, messages, body),
          headers: buildIdempotencyHeaders(messages, messageId),
        }),
        prepareReconnectToStreamRequest: () => ({
          api: buildReconnectApi(lastRunIdRef.current),
        }),
      }),
    [],
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
  } = useChat({
    id: sessionId ?? undefined,
    transport,
    // Disabled for now: useChat calls resumeStream() unconditionally on
    // mount regardless of whether a run has ever started, which calls
    // prepareReconnectToStreamRequest with no runId available yet —
    // buildReconnectApi(null) throws, landing the chat in a spurious
    // status:"error" state before the user has sent anything. Reconnect
    // needs to be scoped to "there is a run to resume" (e.g. persist the
    // last known runId per session) before this is safe to turn back on.
    resume: false,
    onData: (part) => {
      if (part.type === "data-run") {
        const data = part.data as { runId?: string };
        if (data.runId) lastRunIdRef.current = data.runId;
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
    onError: (err) => {
      if (err.message.includes("401")) onUnauthorized?.();
    },
  });

  useEffect(() => {
    setModelState(modelProp);
  }, [modelProp]);

  const streaming = status === "submitted" || status === "streaming";

  // Read inside the effect via a ref, NOT as a dependency — depending on
  // `streaming` directly would re-run this effect on every submitted/
  // streaming/ready transition, including the one that fires the instant a
  // turn finishes. The page only calls setInitialMessages at a few discrete
  // moments (initial load, retry-after-login, workflow refresh) and never
  // again once a turn completes, so `initialMessages` is stale at that
  // point — re-running here would wipe the just-finished reply straight off
  // the still-mounted useChat state it lives in.
  const streamingRef = useRef(streaming);
  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  // Reconcile with server history on every `initialMessages` change — the
  // real page calls setInitialMessages repeatedly (initial load, retry
  // after login, workflow reconciliation refresh), not just once, and each
  // of those needs to actually reach the chat. Server data is authoritative
  // whenever nothing is actively streaming (Phase 1 persists parts, so
  // there's nothing ephemeral left to lose by trusting it); skip only while
  // a turn is in flight so this can't clobber a live stream mid-response.
  useEffect(() => {
    if (!sessionId || !initialMessages || streamingRef.current) return;
    setMessages(initialMessages.map(messageToUIMessage));
  }, [sessionId, initialMessages, setMessages]);

  const uiMessages: UiChatMessage[] = useMemo(
    () =>
      messages.map((m, i) =>
        uiMessageToChatMessage(m, { streaming: streaming && i === messages.length - 1 }),
      ),
    [messages, streaming],
  );

  const doSend = useCallback(
    async (text: string, overrides?: SendOverrides): Promise<"sent" | "rejected"> => {
      if (!sessionId) return "rejected";
      await sendMessage(
        { text },
        {
          body: {
            model: overrides?.model ?? model,
            skillIds: overrides?.skillIds ?? skillIdsProp,
            capabilityPresetId: overrides?.capabilityPresetId,
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
  // not this), so this reimplements the ~40 lines the legacy store had.
  useEffect(() => {
    if (streaming || queue.length === 0) return;
    const [next, ...rest] = queue;
    if (!next) return;
    setQueue(rest);
    void doSend(next.content, {
      model: next.model,
      capabilityPresetId: next.capabilityPresetId,
      skillIds: next.skillIds,
      referencedArtifactIds: next.referencedArtifactIds,
      referencedArtifactId: next.referencedArtifactId,
    });
  }, [streaming, queue, doSend]);

  const send = useCallback(
    async (
      text: string,
      overrides?: SendOverrides,
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
    (text: string, label = "正在处理…"): PreparedLiveChatTurn | null => {
      if (!sessionId || streaming) return null;
      const turnId = clientId("turn");
      const placeholderId = clientId("assistant-preparing");
      const startedAt = Date.now();
      let userMessageId = clientId("user");

      // metadata.preparing is this hook's private wire format for the
      // "waiting on preflight before the real turn starts" placeholder —
      // uiMessageToChatMessage (ui-message-adapter.ts) reads it back into
      // the same activityLabel/streamPhase fields the legacy store's
      // assistantPreparingMessage() produces, so ChatThread renders it
      // identically regardless of which hook is active.
      const placeholderMessage = (): UIMessage =>
        ({
          id: placeholderId,
          role: "assistant",
          parts: [],
          metadata: { preparing: { label, startedAt } },
        }) as UIMessage;

      setMessages((prev) => {
        const reusableId = findReusableOptimisticUserMessageId(prev, text);
        if (reusableId) {
          userMessageId = reusableId;
          return [...prev, placeholderMessage()];
        }
        return [
          ...prev,
          { id: userMessageId, role: "user", parts: textPart(text) } as UIMessage,
          placeholderMessage(),
        ];
      });

      const setStatus = (nextLabel: string) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? ({ ...m, metadata: { preparing: { label: nextLabel, startedAt } } } as UIMessage)
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
                } as UIMessage)
              : m,
          ),
        );
      };

      const commit = async (
        commitText: string,
        overrides?: SendOverrides,
      ): Promise<"sent" | "rejected"> => {
        // The server mints its own assistant id via the `start` chunk —
        // drop the local placeholder so it doesn't linger as a duplicate.
        setMessages((prev) => prev.filter((m) => m.id !== placeholderId));
        await sendMessage(
          { text: commitText, messageId: userMessageId },
          {
            body: {
              model: overrides?.model ?? model,
              skillIds: overrides?.skillIds ?? skillIdsProp,
              capabilityPresetId: overrides?.capabilityPresetId,
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

  // Workflow is a separate subsystem inside live-chat-session.ts (its own
  // entries/state, orthogonal to the useChat message stream this hook
  // manages) — delegate straight to it, same as the legacy hook does, so a
  // workflow-bound session keeps working after the cutover instead of
  // crashing on first use.
  const startWorkflow = useCallback(
    (stage: WorkflowLiveStage): Promise<"sent" | "rejected"> => {
      if (!sessionId) return Promise.resolve("rejected");
      return startWorkflowLiveChat(sessionId, stage);
    },
    [sessionId],
  );

  const attachWorkflowRun = useCallback(
    (runId: string, stage: WorkflowLiveStage): WorkflowRunAttachment | null => {
      if (!sessionId) return null;
      return attachWorkflowRunStore(sessionId, runId, stage);
    },
    [sessionId],
  );

  // Stops both possible turn owners: useChat's own in-flight sendMessage,
  // and the legacy store's controller for a workflow turn (workflow doesn't
  // run through useChat at all — see startWorkflow above). Aborting an
  // already-idle controller is a harmless no-op, so calling both unconditionally
  // is safe and correct regardless of which one is actually active.
  const stop = useCallback(() => {
    stopChat();
    if (sessionId) stopLiveChat(sessionId);
  }, [stopChat, sessionId]);

  return {
    sessionId: id ?? sessionId,
    messages: uiMessages,
    rawMessages: messages,
    streaming,
    error: error?.message ?? null,
    model,
    setModel: setModelState,
    setMessages: (update) => {
      const next = typeof update === "function" ? update(uiMessages) : update;
      throw new Error(
        `useStudioChatV2.setMessages is not implemented (attempted to set ${next.length} messages) — this hook is groundwork-only and not yet wired to any page`,
      );
    },
    send,
    prepare,
    startWorkflow,
    attachWorkflowRun,
    stop,
    clearError,
    queue,
    removeFromQueue,
    clearQueue,
  };
}
