"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ProductionWorkflowAction,
  ProductionWorkflowCommand,
  ProductionWorkflowProjection,
} from "@/lib/agent/production-packs/workflow-contract";
import {
  executeSessionWorkflowCommand,
  getSessionWorkflow,
  StudioApiError,
} from "@/lib/studio/api";
import { toWorkflowViewState } from "@/lib/studio/workflow-state";
import type {
  UseStudioChatResult,
  WorkflowLiveStage,
  WorkflowRunAttachment,
} from "../useStudioChat";

const FOCUS_STALE_MS = 30_000;
const PROJECTION_POLL_MS = 2_000;

type WorkflowChatOperations = Pick<
  UseStudioChatResult,
  "startWorkflow" | "attachWorkflowRun" | "stop" | "streaming"
>;

type RefreshCallback = () => void | Promise<unknown>;

export type UseSessionWorkflowOptions = {
  sessionId?: string | null;
  enabled: boolean;
  chat: WorkflowChatOperations;
  refreshSession: RefreshCallback;
  refreshArtifacts: RefreshCallback;
  onUnauthorized: () => void;
};

export type UseSessionWorkflowResult = {
  projection: ProductionWorkflowProjection | null;
  loading: boolean;
  refreshing: boolean;
  reconnecting: boolean;
  error: string | null;
  actionError: string | null;
  pendingAction: ProductionWorkflowAction | null;
  viewState: ReturnType<typeof toWorkflowViewState>;
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  approve: (note?: string) => Promise<boolean>;
  requestChanges: (note: string) => Promise<boolean>;
  startNext: () => Promise<boolean>;
  retryStage: () => Promise<boolean>;
  refresh: () => Promise<ProductionWorkflowProjection | null>;
  clearActionError: () => void;
};

type ActiveAttachment = {
  runId: string;
  token: symbol;
  handle: WorkflowRunAttachment;
};

type InFlightAction = {
  fingerprint: string;
  promise: Promise<boolean>;
};

type StoredProjection = {
  sessionId: string;
  value: ProductionWorkflowProjection;
};

function clientCommandKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `workflow-command-${crypto.randomUUID()}`;
  }
  return `workflow-command-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isActiveRun(projection: ProductionWorkflowProjection | null): boolean {
  return projection?.run?.status === "queued" || projection?.run?.status === "running";
}

function toLiveStage(
  projection: ProductionWorkflowProjection,
  intent: WorkflowLiveStage["intent"],
): WorkflowLiveStage {
  return {
    workflowId: projection.workflowId,
    id: projection.currentStage.id,
    title: projection.currentStage.title,
    iteration: projection.run?.iteration ?? 0,
    intent,
  };
}

export function useSessionWorkflow({
  sessionId,
  enabled,
  chat,
  refreshSession,
  refreshArtifacts,
  onUnauthorized,
}: UseSessionWorkflowOptions): UseSessionWorkflowResult {
  const startLiveWorkflow = chat.startWorkflow;
  const attachLiveWorkflowRun = chat.attachWorkflowRun;
  const stopLiveWorkflow = chat.stop;
  const chatStreaming = chat.streaming;
  const [storedProjection, setStoredProjection] = useState<StoredProjection | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<ProductionWorkflowAction | null>(null);
  const mountedRef = useRef(true);
  const projectionRef = useRef<ProductionWorkflowProjection | null>(null);
  const lastUpdatedAtRef = useRef(0);
  const refreshRequestRef = useRef(0);
  const sessionGenerationRef = useRef(0);
  const refreshPromiseRef = useRef<Promise<ProductionWorkflowProjection | null> | null>(null);
  const attachmentRef = useRef<ActiveAttachment | null>(null);
  const actionRef = useRef<InFlightAction | null>(null);
  const projection =
    storedProjection && storedProjection.sessionId === sessionId
      ? storedProjection.value
      : null;

  const acceptProjection = useCallback((next: ProductionWorkflowProjection | null) => {
    projectionRef.current = next;
    setStoredProjection(next && sessionId ? { sessionId, value: next } : null);
    if (next) lastUpdatedAtRef.current = Date.now();
  }, [sessionId]);

  const refresh = useCallback((force = false): Promise<ProductionWorkflowProjection | null> => {
    if (!enabled || !sessionId) return Promise.resolve(null);
    const existing = refreshPromiseRef.current;
    if (existing && !force) return existing;
    if (force && existing) {
      refreshRequestRef.current += 1;
      refreshPromiseRef.current = null;
    }

    const request = refreshRequestRef.current + 1;
    refreshRequestRef.current = request;
    if (projectionRef.current) setRefreshing(true);
    else setLoading(true);

    const pending = (async () => {
      try {
        const next = await getSessionWorkflow(sessionId);
        if (!mountedRef.current || refreshRequestRef.current !== request) return null;
        acceptProjection(next);
        setError(null);
        return next;
      } catch (reason: unknown) {
        if (!mountedRef.current || refreshRequestRef.current !== request) return null;
        if (reason instanceof StudioApiError && reason.status === 401) onUnauthorized();
        setError(messageFor(reason, "加载工作流状态失败"));
        return null;
      } finally {
        if (mountedRef.current && refreshRequestRef.current === request) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    refreshPromiseRef.current = pending;
    void pending.finally(() => {
      if (refreshPromiseRef.current === pending) refreshPromiseRef.current = null;
    });
    return pending;
  }, [acceptProjection, enabled, onUnauthorized, sessionId]);

  const refreshAfterTerminal = useCallback(async () => {
    await Promise.allSettled([
      refresh(true),
      Promise.resolve().then(refreshSession),
      Promise.resolve().then(refreshArtifacts),
    ]);
  }, [refresh, refreshArtifacts, refreshSession]);

  const followRun = useCallback(
    (
      runId: string,
      source: ProductionWorkflowProjection,
      intent: WorkflowLiveStage["intent"],
    ) => {
      if (!runId) return;
      if (attachmentRef.current?.runId === runId) return;
      attachmentRef.current?.handle.detach();

      const handle = attachLiveWorkflowRun(runId, toLiveStage(source, intent));
      if (!handle) {
        setActionError("无法连接工作流运行");
        return;
      }
      const token = Symbol(runId);
      attachmentRef.current = { runId, token, handle };
      setReconnecting(true);

      void handle.terminal.then(async (outcome) => {
        if (attachmentRef.current?.token !== token) return;
        attachmentRef.current = null;
        if (outcome === "settled") await refreshAfterTerminal();
        if (mountedRef.current && attachmentRef.current === null) {
          setReconnecting(false);
        }
      });
    },
    [attachLiveWorkflowRun, refreshAfterTerminal],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      refreshRequestRef.current += 1;
      attachmentRef.current?.handle.detach();
      attachmentRef.current = null;
    };
  }, []);

  useEffect(() => {
    sessionGenerationRef.current += 1;
    refreshRequestRef.current += 1;
    refreshPromiseRef.current = null;
    actionRef.current = null;
    attachmentRef.current?.handle.detach();
    attachmentRef.current = null;
    projectionRef.current = null;
    const timer = window.setTimeout(() => {
      setStoredProjection(null);
      setError(null);
      setActionError(null);
      setPendingAction(null);
      setReconnecting(false);
      setLoading(Boolean(enabled && sessionId));
      if (enabled && sessionId) void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [enabled, refresh, sessionId]);

  useEffect(() => {
    const run = projection?.run;
    if (
      !enabled ||
      !run ||
      (run.status !== "queued" && run.status !== "running") ||
      chatStreaming
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      followRun(run.id, projection, "stage_start");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [chatStreaming, enabled, followRun, projection]);

  useEffect(() => {
    if (!enabled || !sessionId || (!isActiveRun(projection) && !reconnecting)) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, PROJECTION_POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, projection, reconnecting, refresh, sessionId]);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const onFocus = () => {
      if (Date.now() - lastUpdatedAtRef.current >= FOCUS_STALE_MS) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled, refresh, sessionId]);

  const runExclusiveAction = useCallback(
    (
      action: ProductionWorkflowAction,
      fingerprint: string,
      operation: () => Promise<boolean>,
    ): Promise<boolean> => {
      const active = actionRef.current;
      if (active) {
        if (active.fingerprint === fingerprint) return active.promise;
        setActionError("另一项工作流操作正在处理中");
        return Promise.resolve(false);
      }

      setPendingAction(action);
      setActionError(null);
      const promise = operation().finally(() => {
        const ownsAction = actionRef.current?.promise === promise;
        if (ownsAction) actionRef.current = null;
        if (mountedRef.current && ownsAction) setPendingAction(null);
      });
      actionRef.current = { fingerprint, promise };
      return promise;
    },
    [],
  );

  const requireAction = useCallback((action: ProductionWorkflowAction) => {
    const current = projectionRef.current;
    if (current?.actions.includes(action)) return current;
    setActionError("当前工作流状态不支持此操作，请刷新后重试");
    return null;
  }, []);

  const start = useCallback(() => {
    return runExclusiveAction("start", "start", async () => {
      const current = requireAction("start");
      if (!current) return false;
      const generation = sessionGenerationRef.current;
      const terminal = startLiveWorkflow(toLiveStage(current, "stage_start"));
      const first = await Promise.race([
        terminal.then((result) => ({ kind: "terminal" as const, result })),
        new Promise<{ kind: "submitted" }>((resolve) => {
          window.setTimeout(() => resolve({ kind: "submitted" }), 250);
        }),
      ]);
      if (!mountedRef.current || sessionGenerationRef.current !== generation) return false;
      if (first.kind === "terminal" && first.result === "rejected") {
        setActionError("工作流暂时无法开始，请刷新后重试");
        return false;
      }
      if (first.kind === "terminal") {
        await refreshAfterTerminal();
        return true;
      }

      await refresh(true);
      void terminal.then(async (result) => {
        if (
          result !== "sent" ||
          !mountedRef.current ||
          sessionGenerationRef.current !== generation
        ) {
          return;
        }
        await refreshAfterTerminal();
      });
      return true;
    });
  }, [
    refresh,
    refreshAfterTerminal,
    requireAction,
    runExclusiveAction,
    startLiveWorkflow,
  ]);

  const stop = useCallback(() => {
    return runExclusiveAction("stop", "stop", async () => {
      if (!requireAction("stop")) return false;
      stopLiveWorkflow();
      await refresh(true);
      return true;
    });
  }, [refresh, requireAction, runExclusiveAction, stopLiveWorkflow]);

  const executeCommand = useCallback(
    (
      action: Exclude<ProductionWorkflowAction, "start" | "stop">,
      command: (runId: string) => ProductionWorkflowCommand,
      intent?: WorkflowLiveStage["intent"],
      fingerprintSuffix = "",
    ) => {
      return runExclusiveAction(action, `${action}:${fingerprintSuffix}`, async () => {
        const current = requireAction(action);
        const runId = current?.run?.id;
        if (!current || !runId || !sessionId) return false;
        const generation = sessionGenerationRef.current;
        const idempotencyKey = clientCommandKey();
        try {
          const result = await executeSessionWorkflowCommand(
            sessionId,
            command(runId),
            idempotencyKey,
          );
          if (!mountedRef.current || sessionGenerationRef.current !== generation) return false;
          acceptProjection(result.workflow);
          if (result.command.startedRunId && intent) {
            followRun(result.command.startedRunId, result.workflow, intent);
          }
          await refresh(true);
          return true;
        } catch (reason: unknown) {
          if (!mountedRef.current || sessionGenerationRef.current !== generation) return false;
          if (reason instanceof StudioApiError && reason.status === 409) {
            await refresh(true);
            if (!mountedRef.current || sessionGenerationRef.current !== generation) return false;
            setActionError("工作流状态已更新，请确认后重试");
            return false;
          }
          if (reason instanceof StudioApiError && reason.status === 401) onUnauthorized();
          setActionError(messageFor(reason, "更新工作流状态失败"));
          return false;
        }
      });
    },
    [
      acceptProjection,
      followRun,
      onUnauthorized,
      refresh,
      requireAction,
      runExclusiveAction,
      sessionId,
    ],
  );

  const approve = useCallback(
    (note?: string) => {
      const normalized = note?.trim();
      return executeCommand(
        "approve",
        (runId) => ({
          action: "approve",
          runId,
          ...(normalized ? { note: normalized } : {}),
        }),
        undefined,
        normalized ?? "",
      );
    },
    [executeCommand],
  );

  const requestChanges = useCallback(
    (note: string) => {
      const normalized = note.trim();
      if (!normalized) {
        setActionError("请填写需要修改的内容");
        return Promise.resolve(false);
      }
      return executeCommand(
        "request_changes",
        (runId) => ({ action: "request_changes", runId, note: normalized }),
        "revision_start",
        normalized,
      );
    },
    [executeCommand],
  );

  const startNext = useCallback(
    () =>
      executeCommand(
        "start_next",
        (runId) => ({ action: "start_next", runId }),
        "stage_start",
      ),
    [executeCommand],
  );

  const retryStage = useCallback(
    () =>
      executeCommand(
        "retry_stage",
        (runId) => ({ action: "retry_stage", runId }),
        "retry_start",
      ),
    [executeCommand],
  );

  const viewState = useMemo(
    () => toWorkflowViewState(loading && !projection ? undefined : projection),
    [loading, projection],
  );

  return {
    projection,
    loading,
    refreshing,
    reconnecting,
    error,
    actionError,
    pendingAction,
    viewState,
    start,
    stop,
    approve,
    requestChanges,
    startNext,
    retryStage,
    refresh,
    clearActionError: () => setActionError(null),
  };
}
