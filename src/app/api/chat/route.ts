import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import type { AgentSseEvent, SessionWorkflowBinding } from "@/lib/agent/types";
import {
  RunCoordinatorError,
  RunPolicyError,
  RunStoreError,
  getAgentRunService,
  type RunEvent,
  type RunStatus,
} from "@/lib/agent/infrastructure";
import {
  normalizeExecutionMode,
  type AgentExecutionMode,
} from "@/lib/agent/executor";
import {
  registerTurn,
  unregisterTurn,
} from "@/lib/agent/turn-registry";
import { getProductionPack } from "@/lib/agent/production-packs/registry";
import { resolveProductionPackAvailability } from "@/lib/agent/production-packs/availability";
import {
  resolveWorkflowAllowedTools,
  selectedWorkflowModel,
} from "@/lib/agent/production-packs/execution-policy";
import { parseWorkflowSessionBinding } from "@/lib/agent/production-packs/session-binding";
import {
  prepareFirstProductionStage,
  serializeProductionRunMetadata,
} from "@/lib/agent/production-packs/run-metadata";
import { webStore } from "@/lib/host/web/store-singleton";
import { loadCapabilityCatalog } from "@/lib/studio/capabilities.server";
import type { StudioToolName } from "@/lib/agent/tools/definitions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseFrame(event: AgentSseEvent, sequence?: number): string {
  const id = sequence === undefined ? "" : `id: ${sequence}\n`;
  return `${id}data: ${JSON.stringify(event)}\n\n`;
}

function isTerminalStatus(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function toClientEvent(runId: string, event: RunEvent): AgentSseEvent | null {
  if (event.type === "agent.event") return event.payload.event;
  if (event.type === "run.status_changed") {
    return { type: "run", runId, status: event.payload.to };
  }
  return null;
}

function responseForRunError(error: unknown): Response {
  if (error instanceof RunPolicyError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: 403 },
    );
  }
  if (error instanceof RunStoreError && error.code === "idempotency_conflict") {
    return Response.json(
      { error: "Idempotency key belongs to a different request", code: error.code },
      { status: 409 },
    );
  }
  if (error instanceof RunCoordinatorError) {
    return Response.json({ error: error.message, code: error.code }, { status: 409 });
  }
  return Response.json({ error: "Unable to start agent run" }, { status: 500 });
}

type ChatBody = {
  sessionId?: string;
  projectId?: string;
  message?: string;
  model?: string;
  capabilityPresetId?: string;
  executionMode?: AgentExecutionMode;
  workflowAction?: "start";
  skillIds?: string[];
  /** Multi @-mention image artifact ids (preferred). */
  referencedArtifactIds?: string[];
  /** @deprecated Use referencedArtifactIds */
  referencedArtifactId?: string;
};

/**
 * POST /api/chat - create a durable agent run and stream its persisted events.
 * Client disconnect does not cancel the worker. POST /api/chat/stop is the
 * explicit cancellation path.
 */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.workflowAction !== undefined && body.workflowAction !== "start") {
    return Response.json({ error: "Invalid workflow action" }, { status: 400 });
  }
  const workflowAction = body.workflowAction;
  let message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message && workflowAction !== "start") {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const requestedModel =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : undefined;
  const requestedProjectId =
    typeof body.projectId === "string" && body.projectId.trim()
      ? body.projectId.trim()
      : undefined;
  const requestedCapabilityPresetId =
    typeof body.capabilityPresetId === "string" && body.capabilityPresetId.trim()
      ? body.capabilityPresetId.trim()
      : undefined;
  const executionMode = normalizeExecutionMode(
    body.executionMode ?? process.env.REIZO_AGENT_EXECUTION_MODE,
  );
  let skillIds = Array.isArray(body.skillIds)
    ? body.skillIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean)
    : undefined;
  let referencedArtifactIds = [
    ...(Array.isArray(body.referencedArtifactIds)
      ? body.referencedArtifactIds
      : []),
    ...(typeof body.referencedArtifactId === "string"
      ? [body.referencedArtifactId]
      : []),
  ]
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim());

  let sessionId =
    typeof body.sessionId === "string" && body.sessionId.trim()
      ? body.sessionId.trim()
      : "";
  let projectId = requestedProjectId;
  let model = requestedModel ?? "gpt-4o-mini";
  let sessionWorkflow: SessionWorkflowBinding | undefined;

  if (!sessionId) {
    if (workflowAction) {
      return Response.json(
        { error: "Workflow action requires a validated Session" },
        { status: 400 },
      );
    }
    if (requestedCapabilityPresetId) {
      return Response.json(
        { error: "Capability preset requires a validated session" },
        { status: 400 },
      );
    }
    if (projectId) {
      const project = await webStore.projects.getProject(userId, projectId);
      if (!project) {
        return Response.json({ error: "Project not found" }, { status: 404 });
      }
    }
    const session = await webStore.sessions.createSession({
      id: randomUUID(),
      userId,
      title: "新对话",
      model,
      ...(projectId ? { projectId } : {}),
    });
    sessionId = session.id;
  } else {
    const existing = await webStore.sessions.getSession(userId, sessionId);
    if (!existing) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
    if (
      requestedCapabilityPresetId &&
      requestedCapabilityPresetId !== existing.capabilityPresetId
    ) {
      return Response.json(
        { error: "Capability preset does not match this session" },
        { status: 400 },
      );
    }
    if (projectId && existing.projectId !== projectId) {
      return Response.json(
        { error: "Session is outside the requested project" },
        { status: 409 },
      );
    }
    projectId = existing.projectId;
    model = requestedModel ?? existing.model;
    sessionWorkflow = existing.workflow;
    if (projectId) {
      const project = await webStore.projects.getProject(userId, projectId);
      if (!project) {
        return Response.json({ error: "Project not found" }, { status: 404 });
      }
    }
  }

  let workflowMetadata:
    | { production: ReturnType<typeof serializeProductionRunMetadata> }
    | undefined;
  let workflowIdempotencyScope: string | undefined;
  let workflowIdempotencyKey: string | undefined;
  let workflowAllowedToolNames: StudioToolName[] | undefined;
  if (workflowAction === "start") {
    if (
      requestedModel ||
      requestedCapabilityPresetId ||
      body.executionMode !== undefined ||
      skillIds?.length ||
      referencedArtifactIds.length
    ) {
      return Response.json(
        { error: "Workflow execution settings are server-owned" },
        { status: 400 },
      );
    }
    if (!sessionWorkflow) {
      return Response.json(
        { error: "Session is not a Workflow Session" },
        { status: 409 },
      );
    }

    let binding;
    try {
      binding = parseWorkflowSessionBinding(sessionWorkflow);
    } catch {
      return Response.json(
        { error: "Stored workflow binding is invalid" },
        { status: 409 },
      );
    }
    const pack = binding.packSnapshot ?? (await getProductionPack(binding.packId));
    if (
      !pack ||
      pack.id !== binding.packId ||
      pack.version !== binding.packVersion
    ) {
      return Response.json(
        { error: "Pack version is unavailable", code: "pack_version_unavailable" },
        { status: 409 },
      );
    }
    const capabilityCatalog = await loadCapabilityCatalog();
    const availability = resolveProductionPackAvailability(pack, capabilityCatalog);
    if (!availability.available) {
      return Response.json(
        {
          error: "Pack requirements are unavailable",
          code: "pack_unavailable",
          availability,
        },
        { status: 409 },
      );
    }

    const stage = pack.stages[0];
    workflowAllowedToolNames =
      (await resolveWorkflowAllowedTools(pack, stage, capabilityCatalog)) ??
      undefined;
    if (!workflowAllowedToolNames) {
      return Response.json(
        {
          error: "Pack execution policy is unavailable",
          code: "pack_execution_policy_unavailable",
        },
        { status: 409 },
      );
    }

    const transition = prepareFirstProductionStage(pack, binding);
    message = [
      pack.title,
      `开始「${stage.title}」阶段。`,
      `阶段目标：${stage.objective}`,
      `已确认信息：${JSON.stringify(binding.intakeValues)}`,
    ].join("\n\n");
    model = selectedWorkflowModel(capabilityCatalog);
    skillIds = transition.effect.skillIds;
    referencedArtifactIds = transition.effect.referencedArtifactIds;
    workflowMetadata = {
      production: serializeProductionRunMetadata({
        ...transition.state,
        execution: {
          ...transition.state.execution,
          allowedTools: workflowAllowedToolNames,
        },
      }),
    };
    workflowIdempotencyScope = `user:${userId}:${transition.effect.idempotencyScope}`;
    workflowIdempotencyKey = transition.effect.idempotencyKey;
  }

  const service = getAgentRunService();
  const idempotencyKey =
    workflowIdempotencyKey ??
    (request.headers.get("idempotency-key")?.trim() || undefined);
  const activeRun = await service.findActiveSessionRun(userId, sessionId);
  let runId: string;
  let initialRunStatus: RunStatus;
  let turn: ReturnType<typeof registerTurn> = null;
  let ownsReservation = false;

  if (
    activeRun &&
    activeRun.idempotencyKey === idempotencyKey &&
    idempotencyKey &&
    (!workflowIdempotencyScope ||
      activeRun.idempotencyScope === workflowIdempotencyScope)
  ) {
    // A transport retry with the same key joins the existing durable run.
    runId = activeRun.id;
    initialRunStatus = activeRun.status;
  } else if (activeRun) {
    return Response.json(
      { error: "该会话已有进行中的回复，请稍候或先停止", runId: activeRun.id },
      { status: 409 },
    );
  } else {
    turn = registerTurn(sessionId, userId);
    if (!turn) {
      return Response.json(
        { error: "该会话已有进行中的回复，请稍候或先停止" },
        { status: 409 },
      );
    }
    const createdTurn = turn;

    try {
      const submitted = await service.coordinator.submit({
        userId,
        sessionId,
        ...(projectId ? { projectId } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
        ...(workflowIdempotencyScope
          ? { idempotencyScope: workflowIdempotencyScope }
          : {}),
        ...(workflowMetadata ? { metadata: workflowMetadata } : {}),
        input: {
          message,
          executionMode,
          model,
          ...(skillIds?.length ? { skillIds } : {}),
          ...(workflowMetadata ? { skillSelectionMode: "replace" as const } : {}),
          ...(workflowAllowedToolNames
            ? { allowedToolNames: workflowAllowedToolNames }
            : {}),
          ...(referencedArtifactIds.length ? { referencedArtifactIds } : {}),
        },
      });
      runId = submitted.run.id;
      initialRunStatus = submitted.run.status;
      ownsReservation = submitted.created;
      if (!submitted.created) {
        unregisterTurn(sessionId, createdTurn.controller);
        turn = null;
      }
    } catch (error) {
      unregisterTurn(sessionId, createdTurn.controller);
      return responseForRunError(error);
    }
  }

  // The in-process worker is only the local adapter. The durable run/event
  // record remains the source of truth for future external workers and replay.
  service.start();

  // Keep the session reservation until the worker reaches a terminal state,
  // even when this browser closes the SSE connection.
  if (turn && ownsReservation) {
    const reservedTurn = turn;
    let releaseReservation: (() => void) | undefined;
    const releaseWhenTerminal = (event: RunEvent) => {
      if (
        event.type === "run.status_changed" &&
        isTerminalStatus(event.payload.to)
      ) {
        releaseReservation?.();
      }
    };
    const reservationUnsubscribe = service.coordinator.subscribe(
      runId,
      releaseWhenTerminal,
    );
    releaseReservation = () => {
      reservationUnsubscribe();
      unregisterTurn(sessionId, reservedTurn.controller);
      releaseReservation = undefined;
    };
    void service.coordinator
      .replay(runId)
      .then((events) => events.forEach(releaseWhenTerminal))
      .catch(() => {
        // The worker/store path handles durable failure state. Keep the local
        // reservation until it can observe that terminal event.
      });
  }

  const clientSignal = request.signal;
  const encoder = new TextEncoder();
  let detachClient: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastSequence = 0;
      let flushing = false;
      let flushAgain = false;

      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        clientSignal.removeEventListener("abort", onClientAbort);
        try {
          controller.close();
        } catch {
          // The reader may have already cancelled the stream.
        }
      };

      const emit = (event: AgentSseEvent, sequence?: number) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseFrame(event, sequence)));
        } catch {
          close();
        }
      };

      const flush = async () => {
        if (flushing) {
          flushAgain = true;
          return;
        }
        flushing = true;
        try {
          do {
            flushAgain = false;
            const events = await service.coordinator.replay(runId, lastSequence);
            for (const event of events) {
              lastSequence = event.sequence;
              const clientEvent = toClientEvent(runId, event);
              if (clientEvent) emit(clientEvent, event.sequence);
            }
            const current = await service.coordinator.getRun(runId);
            if (current && isTerminalStatus(current.status)) {
              close();
              return;
            }
          } while (flushAgain && !closed);
        } catch {
          emit({ type: "error", message: "Unable to read agent run events", code: "run_replay_error" });
          close();
        } finally {
          flushing = false;
        }
      };

      const onClientAbort = () => {
        // Browser disconnect is not a cancellation request. It only detaches
        // this stream; the run continues and can be replayed later.
        close();
      };

      const unsubscribe = service.coordinator.subscribe(runId, () => {
        void flush();
      });
      detachClient = close;
      clientSignal.addEventListener("abort", onClientAbort, { once: true });
      emit({ type: "run", runId, status: initialRunStatus });
      void flush();
    },
    cancel() {
      detachClient?.();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Run-ID": runId,
    },
  });
}
