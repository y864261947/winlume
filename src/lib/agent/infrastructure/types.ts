import type { AgentExecutionMode } from "@/lib/agent/executor/types";
import type { AgentSseEvent } from "@/lib/agent/types";

/**
 * Version of the persisted run envelope. Bump this only when the stored shape
 * changes in a way that needs a migration.
 */
export const RUN_SCHEMA_VERSION = 1 as const;

/** Version of the append-only run event envelope. */
export const RUN_EVENT_VERSION = 1 as const;

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type TerminalRunStatus = Extract<
  RunStatus,
  "completed" | "failed" | "cancelled"
>;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

/** Serializable request data. Runtime handles/stores are deliberately absent. */
export interface RunInput {
  message: string;
  executionMode: AgentExecutionMode;
  model?: string;
  skillIds?: string[];
  referencedArtifactIds?: string[];
  /** Reserved for project-level context and future account/team metadata. */
  metadata?: JsonObject;
}

export interface RunError {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface RunLease {
  token: string;
  ownerId: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface AgentRun {
  schemaVersion: typeof RUN_SCHEMA_VERSION;
  id: string;
  userId: string;
  sessionId: string;
  /** Optional now; required by the project layer once projects are enabled. */
  projectId?: string;
  /** Optional account/team boundary for the upcoming identity layer. */
  organizationId?: string;
  input: RunInput;
  status: RunStatus;
  /** Number of execution attempts, starting at zero before a worker claims it. */
  attempt: number;
  /** Optimistic-concurrency revision, incremented on every mutation. */
  revision: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  cancelRequestedAt?: string;
  idempotencyKey?: string;
  idempotencyScope?: string;
  /** Hash of the idempotent request; used to detect key reuse with new input. */
  requestHash?: string;
  lease?: RunLease;
  error?: RunError;
  metadata?: JsonObject;
}

export interface CreateRunInput {
  id?: string;
  userId: string;
  sessionId: string;
  projectId?: string;
  organizationId?: string;
  input: RunInput;
  idempotencyKey?: string;
  /** Defaults to user + project/session, preventing cross-user dedupe. */
  idempotencyScope?: string;
  metadata?: JsonObject;
}

export interface RunCreateResult {
  run: AgentRun;
  /** False when an idempotency key returned an already-created run. */
  created: boolean;
}

export interface RunListFilter {
  userId?: string;
  sessionId?: string;
  projectId?: string;
  organizationId?: string;
  statuses?: readonly RunStatus[];
  limit?: number;
}

export interface RunPatch {
  metadata?: JsonObject;
  error?: RunError;
  cancelRequestedAt?: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface RunTransitionOptions {
  reason?: string;
  error?: RunError;
  now?: Date;
  expectedRevision?: number;
}

export interface RunEventPayloadMap {
  "run.created": {
    userId: string;
    sessionId: string;
    projectId?: string;
    executionMode: AgentExecutionMode;
  };
  "run.enqueued": {
    queueJobId: string;
  };
  "run.status_changed": {
    from: RunStatus;
    to: RunStatus;
    reason?: string;
    error?: RunError;
  };
  "run.lease_acquired": {
    ownerId: string;
    expiresAt: string;
    attempt: number;
  };
  "run.lease_renewed": {
    ownerId: string;
    expiresAt: string;
  };
  "run.lease_released": {
    ownerId: string;
  };
  "run.cancel_requested": {
    requestedBy?: string;
  };
  "run.error": RunError;
  "run.retry_scheduled": {
    attempt: number;
    delayMs: number;
    error?: RunError;
  };
  "agent.event": {
    event: AgentSseEvent;
  };
  "custom": JsonValue;
}

export type RunEventType = keyof RunEventPayloadMap;
export type RunEventPayload<T extends RunEventType> = RunEventPayloadMap[T];

/**
 * Common event envelope. `sequence` is assigned by the store and is scoped to
 * one run, while `version` identifies the envelope schema for consumers.
 */
interface RunEventEnvelope<T extends RunEventType> {
  version: typeof RUN_EVENT_VERSION;
  eventId: string;
  runId: string;
  sequence: number;
  type: T;
  occurredAt: string;
  producer: string;
  payload: RunEventPayload<T>;
  idempotencyKey?: string;
  correlationId?: string;
  causationId?: string;
  /** Optional indexed metadata for tracing, tenancy, and event consumers. */
  metadata?: JsonObject;
}

/**
 * A distributive union by default, so `event.type` safely narrows payload in
 * API/SSE consumers while callers can still request one concrete event shape.
 */
export type RunEvent<T extends RunEventType = RunEventType> =
  T extends RunEventType ? RunEventEnvelope<T> : never;

export interface AppendRunEventInput<T extends RunEventType> {
  runId: string;
  type: T;
  payload: RunEventPayload<T>;
  producer?: string;
  eventId?: string;
  idempotencyKey?: string;
  correlationId?: string;
  causationId?: string;
  metadata?: JsonObject;
  occurredAt?: Date;
}

export interface ListRunEventsOptions {
  afterSequence?: number;
  beforeSequence?: number;
  limit?: number;
}

export interface LeaseOptions {
  /** Defaults to 30 seconds. */
  ttlMs?: number;
  now?: Date;
}

export interface RunQueueJob {
  id: string;
  runId: string;
  enqueuedAt: string;
  availableAt: string;
  attempt: number;
  maxAttempts: number;
  idempotencyKey?: string;
  payload?: JsonObject;
}

export interface EnqueueRunJobInput {
  runId: string;
  idempotencyKey?: string;
  delayMs?: number;
  maxAttempts?: number;
  payload?: JsonObject;
  now?: Date;
}

export interface EnqueueRunJobResult {
  job: RunQueueJob;
  enqueued: boolean;
}

export interface DequeueRunJobOptions {
  workerId?: string;
  /** Defaults to 30 seconds. */
  leaseMs?: number;
  /** Wait this long for work; zero means non-blocking. */
  waitMs?: number;
  signal?: AbortSignal;
  now?: Date;
}

export interface RunQueueLease {
  leaseId: string;
  workerId: string;
  job: RunQueueJob;
  leasedAt: string;
  expiresAt: string;
}

export interface NackRunJobOptions {
  requeue?: boolean;
  delayMs?: number;
  now?: Date;
}

export interface RenewRunQueueLeaseOptions {
  /** Defaults to 30 seconds. */
  leaseMs?: number;
  now?: Date;
}

export interface RunQueue {
  enqueue(input: EnqueueRunJobInput): Promise<EnqueueRunJobResult>;
  dequeue(options?: DequeueRunJobOptions): Promise<RunQueueLease | null>;
  renew(leaseId: string, options?: RenewRunQueueLeaseOptions): Promise<RunQueueLease | null>;
  ack(leaseId: string): Promise<boolean>;
  nack(leaseId: string, options?: NackRunJobOptions): Promise<boolean>;
  size(): Promise<number>;
  deadLetters(): Promise<RunQueueJob[]>;
  close(): void;
}

export interface RunStore {
  createRun(input: CreateRunInput): Promise<RunCreateResult>;
  getRun(runId: string): Promise<AgentRun | null>;
  listRuns(filter?: RunListFilter): Promise<AgentRun[]>;
  updateRun(
    runId: string,
    patch: RunPatch,
    expectedRevision?: number,
  ): Promise<AgentRun>;
  transitionRun(
    runId: string,
    status: RunStatus,
    options?: RunTransitionOptions,
  ): Promise<AgentRun>;
  requestCancellation(
    runId: string,
    requestedBy?: string,
    now?: Date,
  ): Promise<AgentRun>;
  appendEvent<T extends RunEventType>(
    input: AppendRunEventInput<T>,
  ): Promise<RunEvent<T>>;
  listEvents(
    runId: string,
    options?: ListRunEventsOptions,
  ): Promise<RunEvent[]>;
  findRunByIdempotencyKey(
    scope: string,
    idempotencyKey: string,
  ): Promise<AgentRun | null>;
  acquireLease(
    runId: string,
    ownerId: string,
    options?: LeaseOptions,
  ): Promise<RunLease | null>;
  renewLease(
    runId: string,
    token: string,
    options?: LeaseOptions,
  ): Promise<RunLease | null>;
  releaseLease(runId: string, token: string, now?: Date): Promise<boolean>;
}

export class RunStoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RunStoreError";
    this.code = code;
  }
}

export const TERMINAL_RUN_STATUSES: readonly TerminalRunStatus[] = [
  "completed",
  "failed",
  "cancelled",
];

export function isTerminalRunStatus(status: RunStatus): status is TerminalRunStatus {
  return TERMINAL_RUN_STATUSES.includes(status as TerminalRunStatus);
}

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  if (from === to) return true;
  switch (from) {
    case "queued":
      return to === "running" || to === "cancelled" || to === "failed";
    case "running":
      return (
        to === "waiting_approval" ||
        to === "completed" ||
        to === "failed" ||
        to === "cancelled"
      );
    case "waiting_approval":
      return to === "running" || to === "cancelled" || to === "failed";
    case "completed":
    case "failed":
    case "cancelled":
      return false;
    default:
      return false;
  }
}
