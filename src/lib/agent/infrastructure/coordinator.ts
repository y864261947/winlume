import { createAgentExecutor } from "@/lib/agent/executor";
import { CODEX_EXECUTION_TOOL_NAMES } from "@/lib/agent/executor/types";
import type {
  AgentExecutionInput,
  AgentExecutionMode,
  AgentExecutor,
} from "@/lib/agent/executor/types";
import type { AgentSseEvent } from "@/lib/agent/types";
import type {
  ArtifactStore,
  ProjectStore,
  SessionStore,
} from "@/lib/host/ports";
import type {
  AgentRun,
  AppendRunEventInput,
  CreateRunInput,
  JsonObject,
  RunError,
  RunEvent,
  RunEventType,
  RunQueueLease,
  RunStatus,
  RunStore,
  RunQueue,
} from "./types";
import {
  RunPolicyError,
  createStaticRunPolicy,
  type RunPolicyDecision,
} from "./policy";

export interface RunCoordinatorDependencies {
  store: RunStore;
  queue: RunQueue;
  sessions: SessionStore;
  /** Optional while legacy flat chats remain supported. */
  projects?: ProjectStore;
  artifacts: ArtifactStore;
  policy?: RunPolicyLike;
  executorFactory?: (mode: AgentExecutionMode) => AgentExecutor;
  leaseTtlMs?: number;
  retryDelayMs?: number | ((attempt: number) => number);
}

export interface RunPolicyLike {
  evaluate(input: {
    userId: string;
    projectId?: string;
    organizationId?: string;
    executionMode: AgentExecutionMode;
    model?: string;
    message: string;
    requestedToolNames?: readonly string[];
    metadata?: JsonObject;
  }): RunPolicyDecision;
  assertAllowed?(input: {
    userId: string;
    projectId?: string;
    organizationId?: string;
    executionMode: AgentExecutionMode;
    model?: string;
    message: string;
    requestedToolNames?: readonly string[];
    metadata?: JsonObject;
  }): RunPolicyDecision;
}

export interface SubmitRunOptions {
  maxAttempts?: number;
  delayMs?: number;
}

export interface SubmittedRun {
  run: AgentRun;
  queueJobId: string;
  created: boolean;
  policy: RunPolicyDecision;
}

export interface RunProcessOptions {
  workerId: string;
  waitMs?: number;
  leaseTtlMs?: number;
  signal?: AbortSignal;
  onEvent?: (event: AgentSseEvent, run: AgentRun) => void | Promise<void>;
}

export interface RunProcessResult {
  runId: string;
  status: RunStatus;
  attempt: number;
  processed: boolean;
  retryScheduled: boolean;
  eventCount: number;
}

export type RunEventListener = (event: RunEvent) => void;

export class RunCoordinatorError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RunCoordinatorError";
    this.code = code;
  }
}

interface ActiveExecution {
  controller: AbortController;
  cancelRequested: boolean;
  /** Abort caused by worker or lease loss rather than an end-user stop. */
  interrupted: boolean;
}

/**
 * Server-side run service. It owns the boundary between durable run state,
 * queue leases, policy, and an executor. HTTP/SSE handlers can call `submit`,
 * `processNext`, and `cancel` without knowing worker or persistence details.
 */
export class RunCoordinator {
  private readonly store: RunStore;
  private readonly queue: RunQueue;
  private readonly sessions: SessionStore;
  private readonly projects?: ProjectStore;
  private readonly artifacts: ArtifactStore;
  private readonly policy: RunPolicyLike;
  private readonly executorFactory: (mode: AgentExecutionMode) => AgentExecutor;
  private readonly leaseTtlMs: number;
  private readonly retryDelayMs: number | ((attempt: number) => number);
  private readonly active = new Map<string, ActiveExecution>();
  private readonly listeners = new Map<string, Set<RunEventListener>>();
  private readonly publishedSequence = new Map<string, number>();
  private readonly publishChains = new Map<string, Promise<void>>();

  constructor(dependencies: RunCoordinatorDependencies) {
    this.store = dependencies.store;
    this.queue = dependencies.queue;
    this.sessions = dependencies.sessions;
    this.projects = dependencies.projects;
    this.artifacts = dependencies.artifacts;
    this.policy = dependencies.policy ?? createStaticRunPolicy();
    this.executorFactory = dependencies.executorFactory ?? createAgentExecutor;
    this.leaseTtlMs = validatePositive(
      dependencies.leaseTtlMs ?? 30_000,
      "leaseTtlMs",
    );
    this.retryDelayMs =
      dependencies.retryDelayMs ??
      ((attempt) => Math.min(30_000, 500 * 2 ** Math.max(0, attempt - 1)));
  }

  async submit(
    input: CreateRunInput,
    options: SubmitRunOptions = {},
  ): Promise<SubmittedRun> {
    const policyInput = {
      userId: input.userId,
      projectId: input.projectId,
      organizationId: input.organizationId,
      executionMode: input.input.executionMode,
      model: input.input.model,
      message: input.input.message,
      requestedToolNames: preflightToolNames(input.input.executionMode),
      metadata: input.input.metadata,
    };
    const policy = assertExecutablePolicy(this.policy.evaluate(policyInput), input);
    const maxAttempts = options.maxAttempts ?? policy.limits.maxAttempts;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RunCoordinatorError("invalid_attempts", "maxAttempts must be positive");
    }
    const created = await this.store.createRun(input);
    await this.publishRunEvents(created.run.id);
    const queued = await this.queue.enqueue({
      runId: created.run.id,
      idempotencyKey: `run:${created.run.id}`,
      maxAttempts,
      delayMs: options.delayMs,
    });
    await this.appendEvent({
      runId: created.run.id,
      type: "run.enqueued",
      payload: { queueJobId: queued.job.id },
      producer: "run-coordinator",
      idempotencyKey: `queue:${queued.job.id}`,
    });
    return {
      run: (await this.store.getRun(created.run.id)) ?? created.run,
      queueJobId: queued.job.id,
      created: created.created,
      policy,
    };
  }

  /** Subscribe to newly persisted events for one run. Replay is explicit. */
  subscribe(runId: string, listener: RunEventListener): () => void {
    let listeners = this.listeners.get(runId);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(runId, listeners);
    }
    listeners.add(listener);
    if (!this.publishedSequence.has(runId)) this.publishedSequence.set(runId, 0);
    return () => {
      const current = this.listeners.get(runId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.listeners.delete(runId);
    };
  }

  async getRun(runId: string): Promise<AgentRun | null> {
    return this.store.getRun(runId);
  }

  async replay(
    runId: string,
    afterSequence = 0,
    limit?: number,
  ): Promise<RunEvent[]> {
    return this.store.listEvents(runId, { afterSequence, limit });
  }

  async cancel(runId: string, requestedBy?: string): Promise<AgentRun> {
    const run = await this.store.getRun(runId);
    if (!run) throw new RunCoordinatorError("not_found", `Run not found: ${runId}`);
    if (requestedBy && requestedBy !== run.userId) {
      throw new RunCoordinatorError("forbidden", "Run belongs to another user");
    }
    const updated = await this.store.requestCancellation(runId, requestedBy);
    await this.publishRunEvents(runId);
    const active = this.active.get(runId);
    if (active) {
      active.cancelRequested = true;
      active.controller.abort();
    } else if (updated.status === "queued" || updated.status === "waiting_approval") {
      const cancelled = await this.store.transitionRun(runId, "cancelled", {
        reason: "cancel requested before execution",
      });
      await this.publishRunEvents(runId);
      return cancelled;
    }
    return updated;
  }

  /** Process one queued job; returns null when no work is available. */
  async processNext(options: RunProcessOptions): Promise<RunProcessResult | null> {
    if (!options.workerId.trim()) {
      throw new RunCoordinatorError("invalid_worker", "workerId is required");
    }
    const queueLease = await this.queue.dequeue({
      workerId: options.workerId,
      leaseMs: options.leaseTtlMs ?? this.leaseTtlMs,
      waitMs: options.waitMs,
      signal: options.signal,
    });
    if (!queueLease) return null;

    const run = await this.store.getRun(queueLease.job.runId);
    if (!run) {
      await this.queue.ack(queueLease.leaseId);
      return {
        runId: queueLease.job.runId,
        status: "failed",
        attempt: queueLease.job.attempt,
        processed: false,
        retryScheduled: false,
        eventCount: 0,
      };
    }
    if (run.cancelRequestedAt) {
      const cancelled = await this.cancelQueuedRun(run);
      await this.queue.ack(queueLease.leaseId);
      return resultFor(cancelled, false, false, 0);
    }
    if (run.status === "waiting_approval" || isTerminal(run.status)) {
      await this.queue.ack(queueLease.leaseId);
      return resultFor(run, false, false, 0);
    }

    const runLease = await this.store.acquireLease(run.id, options.workerId, {
      ttlMs: options.leaseTtlMs ?? this.leaseTtlMs,
    });
    if (!runLease) {
      await this.queue.nack(queueLease.leaseId, { delayMs: this.retryDelay(1) });
      return resultFor((await this.store.getRun(run.id)) ?? run, false, true, 0);
    }
    await this.publishRunEvents(run.id);
    const executionRun = (await this.store.getRun(run.id)) ?? run;
    const executionPolicy = this.policy.evaluate({
      userId: executionRun.userId,
      projectId: executionRun.projectId,
      organizationId: executionRun.organizationId,
      executionMode: executionRun.input.executionMode,
      model: executionRun.input.model,
      message: executionRun.input.message,
      requestedToolNames: preflightToolNames(executionRun.input.executionMode),
      metadata: executionRun.input.metadata,
    });
    const executablePolicy = toExecutablePolicy(executionPolicy, executionRun);
    if (!executablePolicy.allowed) {
      const error: RunError = {
        code: executablePolicy.code ?? "run_limit_reached",
        message: executablePolicy.reason ?? "Run rejected by worker policy",
        retryable: false,
      };
      const failed = await this.store.transitionRun(executionRun.id, "failed", {
        reason: error.message,
        error,
      });
      await this.publishRunEvents(executionRun.id);
      await this.queue.ack(queueLease.leaseId);
      return resultFor(failed, true, false, 0);
    }

    const active: ActiveExecution = {
      controller: new AbortController(),
      cancelRequested: false,
      interrupted: false,
    };
    this.active.set(executionRun.id, active);
    const cancellationBeforeExecution = await this.store.getRun(executionRun.id);
    if (cancellationBeforeExecution?.cancelRequestedAt) {
      active.cancelRequested = true;
      active.controller.abort();
    }
    let externalAbort = false;
    const onExternalAbort = () => {
      externalAbort = true;
      active.interrupted = true;
      active.controller.abort();
    };
    options.signal?.addEventListener("abort", onExternalAbort, { once: true });

    const heartbeat = this.startLeaseHeartbeat(
      executionRun.id,
      runLease.token,
      queueLease.leaseId,
      options.leaseTtlMs ?? this.leaseTtlMs,
      active,
    );
    const cancellationPoll = this.startCancellationPoll(executionRun.id, active);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      active.controller.abort();
    }, executionPolicy.limits.maxDurationMs);
    let eventCount = 0;
    let toolCalls = 0;
    let budgetFailure: RunError | undefined;
    let completionReason: "completed" | "cancelled" | "error" | undefined;
    let failure: RunError | undefined;
    let executionStarted = false;
    let retrySafe = false;
    const emitRunError = async (error: RunError) => {
      eventCount += 1;
      await this.appendEvent({
        runId: executionRun.id,
        type: "agent.event",
        payload: {
          event: {
            type: "error",
            message: error.message,
            code: error.code,
          },
        },
        producer: "run-coordinator",
        idempotencyKey: `attempt:${executionRun.attempt}:event:${eventCount}`,
      });
    };
    try {
      const executor = this.executorFactory(executionRun.input.executionMode);
      retrySafe = executor.retrySafety === "safe";
      executionStarted = true;
      const executionInput: AgentExecutionInput = {
        userId: executionRun.userId,
        sessionId: executionRun.sessionId,
        userText: executionRun.input.message,
        projectId: executionRun.projectId,
        runId: executionRun.id,
        model: executionRun.input.model,
        skillIds: executionRun.input.skillIds,
        referencedArtifactIds: executionRun.input.referencedArtifactIds,
        referencedArtifactId: executionRun.input.referencedArtifactIds?.[0],
        sessions: this.sessions,
        projects: this.projects,
        artifacts: this.artifacts,
        signal: active.controller.signal,
        gatewayUserId: executionRun.userId,
      };
      for await (const event of executor.execute(executionInput)) {
        if (event.type === "done") completionReason = event.reason;
        eventCount += 1;
        await this.appendEvent({
          runId: executionRun.id,
          type: "agent.event",
          payload: { event },
          producer: `executor:${executionRun.input.executionMode}`,
          idempotencyKey: `attempt:${executionRun.attempt}:event:${eventCount}`,
        });
        if (options.onEvent) {
          try {
            await options.onEvent(event, executionRun);
          } catch {
            // A disconnected stream must not fail a durable worker run.
          }
        }
        if (event.type === "tool_call") {
          const toolPolicy = this.policy.evaluate({
            userId: executionRun.userId,
            projectId: executionRun.projectId,
            organizationId: executionRun.organizationId,
            executionMode: executionRun.input.executionMode,
            model: executionRun.input.model,
            message: executionRun.input.message,
            requestedToolNames: [event.name],
            metadata: executionRun.input.metadata,
          });
          if (!toolPolicy.allowed) {
            budgetFailure = {
              code: toolPolicy.code ?? "tool_not_allowed",
              message: toolPolicy.reason ?? `Tool is denied by policy: ${event.name}`,
              retryable: false,
            };
            await emitRunError(budgetFailure);
            active.controller.abort();
            break;
          }
          if (toolPolicy.approvalRequiredTools.includes(event.name)) {
            budgetFailure = {
              code: "tool_approval_required",
              message: `Tool requires approval: ${event.name}`,
              retryable: false,
            };
            await emitRunError(budgetFailure);
            active.controller.abort();
            break;
          }
          toolCalls += 1;
          if (toolCalls > executionPolicy.limits.maxToolCalls) {
            budgetFailure = {
              code: "tool_budget_exceeded",
              message: `Run exceeded the ${executionPolicy.limits.maxToolCalls}-tool-call limit`,
              retryable: false,
            };
            await emitRunError(budgetFailure);
            active.controller.abort();
            break;
          }
        }
        if (active.controller.signal.aborted) break;
      }

      const latest = await this.store.getRun(executionRun.id);
      const requestedCancellation = Boolean(latest?.cancelRequestedAt || active.cancelRequested);
      if (requestedCancellation) {
        const cancelled = await this.store.transitionRun(executionRun.id, "cancelled", {
          reason: "cancel requested",
        });
        await this.publishRunEvents(executionRun.id);
        await this.queue.ack(queueLease.leaseId);
        return resultFor(cancelled, true, false, eventCount);
      }
      if (externalAbort || active.interrupted) {
        failure = {
          code: "worker_shutdown",
          message: "Worker stopped before the run completed",
          retryable: true,
        };
        return await this.retryOrFail(
          queueLease,
          executionRun,
          runLease,
          failure,
          eventCount,
          retrySafe,
        );
      }
      if (completionReason === "cancelled" && !timedOut && !budgetFailure) {
        const cancelled = await this.store.transitionRun(executionRun.id, "cancelled", {
          reason: "executor cancelled",
        });
        await this.publishRunEvents(executionRun.id);
        await this.queue.ack(queueLease.leaseId);
        return resultFor(cancelled, true, false, eventCount);
      }
      if (timedOut && !budgetFailure) {
        budgetFailure = {
          code: "duration_budget_exceeded",
          message: `Run exceeded the ${executionPolicy.limits.maxDurationMs}ms duration limit`,
          retryable: false,
        };
        await emitRunError(budgetFailure);
      }
      if (budgetFailure) {
        return await this.retryOrFail(
          queueLease,
          executionRun,
          runLease,
          budgetFailure,
          eventCount,
        );
      }
      if (active.controller.signal.aborted) {
        failure = {
          code: "worker_shutdown",
          message: "Worker stopped before the run completed",
          retryable: true,
        };
        return await this.retryOrFail(
          queueLease,
          executionRun,
          runLease,
          failure,
          eventCount,
          retrySafe,
        );
      }
      if (completionReason === "error") {
        failure = {
          code: "executor_error",
          message: "Executor reported an error",
          retryable: true,
        };
        return await this.retryOrFail(
          queueLease,
          executionRun,
          runLease,
          failure,
          eventCount,
          retrySafe,
        );
      }
      const completed = await this.store.transitionRun(executionRun.id, "completed", {
        reason: "executor completed",
      });
      await this.publishRunEvents(executionRun.id);
      await this.queue.ack(queueLease.leaseId);
      return resultFor(completed, true, false, eventCount);
    } catch (error) {
      const latest = await this.store.getRun(executionRun.id);
      if (latest?.cancelRequestedAt || active.cancelRequested) {
        failure = toRunError(error);
        const cancelled = await this.store.transitionRun(executionRun.id, "cancelled", {
          reason: "cancel requested",
          error: failure,
        });
        await this.publishRunEvents(executionRun.id);
        await this.queue.ack(queueLease.leaseId);
        return resultFor(cancelled, true, false, eventCount);
      }
      failure = active.interrupted || externalAbort
        ? {
            code: "worker_shutdown",
            message: "Worker stopped before the run completed",
            retryable: true,
          }
        : toRunError(error);
      return await this.retryOrFail(
        queueLease,
        executionRun,
        runLease,
        failure,
        eventCount,
        !executionStarted || retrySafe,
      );
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      clearInterval(cancellationPoll);
      options.signal?.removeEventListener("abort", onExternalAbort);
      this.active.delete(executionRun.id);
    }
  }

  /** Run a worker loop until its signal is aborted. */
  async runWorker(
    options: Omit<RunProcessOptions, "waitMs"> & { waitMs?: number },
  ): Promise<void> {
    while (!options.signal?.aborted) {
      try {
        await this.processNext({ ...options, waitMs: options.waitMs ?? 1_000 });
      } catch {
        // Keep the local worker alive across a transient adapter failure. The
        // durable run remains available for the next dequeue/recovery cycle.
        await waitForWorkerRetry(options.signal);
      }
    }
  }

  private async retryOrFail(
    queueLease: RunQueueLease,
    run: AgentRun,
    runLease: { token: string },
    error: RunError,
    eventCount: number,
    retrySafe = true,
  ): Promise<RunProcessResult> {
    await this.store.updateRun(run.id, { error });
    const canRetry =
      retrySafe &&
      error.retryable !== false &&
      run.attempt < queueLease.job.maxAttempts;
    if (canRetry) {
      const delayMs = this.retryDelay(run.attempt);
      await this.appendEvent({
        runId: run.id,
        type: "run.retry_scheduled",
        payload: { attempt: run.attempt, delayMs, error },
        producer: "run-coordinator",
        idempotencyKey: `retry:${run.attempt}`,
      });
      await this.store.releaseLease(run.id, runLease.token);
      await this.publishRunEvents(run.id);
      const requeued = await this.queue.nack(queueLease.leaseId, { delayMs });
      if (requeued) {
        const latest = (await this.store.getRun(run.id)) ?? run;
        return resultFor(latest, true, true, eventCount);
      }
    }
    const failed = await this.store.transitionRun(run.id, "failed", {
      reason: error.message,
      error,
    });
    await this.publishRunEvents(run.id);
    await this.queue.ack(queueLease.leaseId);
    return resultFor(failed, true, false, eventCount);
  }

  private retryDelay(attempt: number): number {
    const delay =
      typeof this.retryDelayMs === "function"
        ? this.retryDelayMs(attempt)
        : this.retryDelayMs;
    return Math.max(0, Number.isFinite(delay) ? delay : 0);
  }

  private async cancelQueuedRun(run: AgentRun): Promise<AgentRun> {
    if (run.status === "queued" || run.status === "waiting_approval") {
      const cancelled = await this.store.transitionRun(run.id, "cancelled", {
        reason: "cancel requested before execution",
      });
      await this.publishRunEvents(run.id);
      return cancelled;
    }
    return run;
  }

  private startLeaseHeartbeat(
    runId: string,
    token: string,
    queueLeaseId: string,
    ttlMs: number,
    active: ActiveExecution,
  ): ReturnType<typeof setInterval> {
    const timer = setInterval(() => {
      void Promise.all([
        this.store.renewLease(runId, token, { ttlMs }),
        this.queue.renew(queueLeaseId, { leaseMs: ttlMs }),
      ])
        .then(([runLease, queueLease]) => {
          if (!runLease || !queueLease) {
            active.interrupted = true;
            active.controller.abort();
          } else {
            void this.publishRunEvents(runId);
          }
        })
        .catch(() => {
          active.interrupted = true;
          active.controller.abort();
        });
    }, Math.max(100, Math.floor(ttlMs / 3)));
    return timer;
  }

  private startCancellationPoll(
    runId: string,
    active: ActiveExecution,
  ): ReturnType<typeof setInterval> {
    const timer = setInterval(() => {
      void this.store
        .getRun(runId)
        .then((run) => {
          void this.publishRunEvents(runId);
          if (run?.cancelRequestedAt) {
            active.cancelRequested = true;
            active.controller.abort();
          }
        })
        .catch(() => {
          // A transient read failure should not kill the worker.
        });
    }, 500);
    return timer;
  }

  private async appendEvent<T extends RunEventType>(
    input: AppendRunEventInput<T>,
  ): Promise<RunEvent<T>> {
    const event = await this.store.appendEvent(input);
    await this.publishRunEvents(event.runId, event);
    return event;
  }

  /**
   * Notify subscribers of newly persisted events. `knownEvent` lets a caller
   * that just appended a single event skip a redundant full-history re-read
   * from the store on the hot per-token streaming path; publishing falls back
   * to `listEvents` whenever there is a gap (first subscribe, or events
   * appended by another path such as a lease heartbeat racing this one).
   */
  private async publishRunEvents(runId: string, knownEvent?: RunEvent): Promise<void> {
    const previous = this.publishChains.get(runId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const listeners = this.listeners.get(runId);
        const afterSequence = this.publishedSequence.get(runId) ?? 0;
        const events =
          knownEvent && knownEvent.runId === runId && knownEvent.sequence === afterSequence + 1
            ? [knownEvent]
            : await this.store.listEvents(runId, { afterSequence });
        for (const event of events) {
          this.publishedSequence.set(runId, event.sequence);
          if (!listeners || listeners.size === 0) continue;
          for (const listener of [...listeners]) {
            try {
              listener(event);
            } catch {
              // A subscriber cannot interrupt worker execution.
            }
          }
        }
      });
    this.publishChains.set(runId, next);
    try {
      await next;
    } finally {
      if (this.publishChains.get(runId) === next) this.publishChains.delete(runId);
    }
  }
}

function preflightToolNames(
  executionMode: AgentExecutionMode,
): readonly string[] | undefined {
  return executionMode === "codex" ? CODEX_EXECUTION_TOOL_NAMES : undefined;
}

function toExecutablePolicy(
  decision: RunPolicyDecision,
  input: Pick<CreateRunInput, "input">,
): RunPolicyDecision {
  if (!decision.allowed || input.input.executionMode !== "codex") return decision;
  if (!decision.approvalRequiredTools.length) return decision;
  return {
    ...decision,
    allowed: false,
    code: "tool_approval_required",
    reason:
      "Codex requires approval for a configured tool, but this transport has no approval-response protocol",
  };
}

function assertExecutablePolicy(
  decision: RunPolicyDecision,
  input: Pick<CreateRunInput, "input">,
): RunPolicyDecision {
  const executable = toExecutablePolicy(decision, input);
  if (!executable.allowed) throw new RunPolicyError(executable);
  return executable;
}

function toRunError(error: unknown): RunError {
  if (error instanceof RunPolicyError) {
    return { code: error.code, message: error.message, retryable: false };
  }
  return {
    code: "executor_error",
    message: error instanceof Error ? error.message : String(error),
    retryable: true,
  };
}

function resultFor(
  run: AgentRun,
  processed: boolean,
  retryScheduled: boolean,
  eventCount: number,
): RunProcessResult {
  return {
    runId: run.id,
    status: run.status,
    attempt: run.attempt,
    processed,
    retryScheduled,
    eventCount,
  };
}

function isTerminal(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function validatePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RunCoordinatorError("invalid_option", `${label} must be positive`);
  }
  return value;
}

function waitForWorkerRetry(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, 100);
    signal?.addEventListener("abort", finish, { once: true });
    if (signal?.aborted) finish();
  });
}
