import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type {
  AgentRun,
  AppendRunEventInput,
  CreateRunInput,
  JsonValue,
  LeaseOptions,
  ListRunEventsOptions,
  RunCreateResult,
  RunEvent,
  RunEventType,
  RunLease,
  RunListFilter,
  RunPatch,
  RunStatus,
  RunStore,
  RunTransitionOptions,
} from "./types";
import {
  RUN_EVENT_VERSION,
  RUN_SCHEMA_VERSION,
  RunStoreError,
  canTransitionRun,
  isTerminalRunStatus,
} from "./types";

const DEFAULT_LEASE_MS = 30_000;
const PERSISTED_STATE_VERSION = 1;

interface PersistedRunState {
  version: typeof PERSISTED_STATE_VERSION;
  runs: Record<string, AgentRun>;
  events: Record<string, RunEvent[]>;
  runIdByIdempotency: Record<string, string>;
  eventIdByIdempotency: Record<string, string>;
}

function emptyState(): PersistedRunState {
  return {
    version: PERSISTED_STATE_VERSION,
    runs: {},
    events: {},
    runIdByIdempotency: {},
    eventIdByIdempotency: {},
  };
}

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function ensureDirectory(path: string): void {
  mkdirSync(path, { recursive: true });
}

function atomicWrite(path: string, value: string): void {
  ensureDirectory(dirname(path));
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, value, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } catch {
      // Keep the original error. Cleanup is best effort.
    }
    throw error;
  }
}

function normalizeState(value: unknown): PersistedRunState {
  if (!value || typeof value !== "object") return emptyState();
  const raw = value as Partial<PersistedRunState>;
  if (raw.version === undefined) return emptyState();
  if (raw.version !== PERSISTED_STATE_VERSION) {
    throw new RunStoreError(
      "unsupported_version",
      `Unsupported run store version: ${String(raw.version)}`,
    );
  }
  return {
    version: PERSISTED_STATE_VERSION,
    runs:
      raw.runs && typeof raw.runs === "object"
        ? (raw.runs as Record<string, AgentRun>)
        : {},
    events:
      raw.events && typeof raw.events === "object"
        ? (raw.events as Record<string, RunEvent[]>)
        : {},
    runIdByIdempotency:
      raw.runIdByIdempotency && typeof raw.runIdByIdempotency === "object"
        ? (raw.runIdByIdempotency as Record<string, string>)
        : {},
    eventIdByIdempotency:
      raw.eventIdByIdempotency && typeof raw.eventIdByIdempotency === "object"
        ? (raw.eventIdByIdempotency as Record<string, string>)
        : {},
  };
}

function iso(date = new Date()): string {
  return date.toISOString();
}

function dateMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function requireId(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RunStoreError("invalid_id", `${label} is required`);
  }
  if (value.includes("/") || value.includes("\\") || value === "." || value === "..") {
    throw new RunStoreError("invalid_id", `${label} contains an unsafe path segment`);
  }
  return value;
}

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

function sha256(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function defaultScope(input: CreateRunInput): string {
  return `${input.userId}:${input.projectId ?? `session:${input.sessionId}`}`;
}

function scopedKey(scope: string, key: string): string {
  return `${scope}\u0000${key}`;
}

function validateLeaseMs(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RunStoreError("invalid_lease", "Lease duration must be positive");
  }
  return value;
}

function eventPayloadFingerprint(event: {
  type: RunEventType;
  payload: JsonValue;
  producer?: string;
  correlationId?: string;
  causationId?: string;
  metadata?: JsonValue;
}): string {
  return sha256({
    type: event.type,
    payload: event.payload,
    producer: event.producer ?? "run-service",
    correlationId: event.correlationId,
    causationId: event.causationId,
    metadata: event.metadata,
  });
}

function requestFingerprint(input: CreateRunInput): string {
  return sha256({
    userId: input.userId,
    sessionId: input.sessionId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    input: input.input,
    metadata: input.metadata,
  });
}

function makeRun(input: CreateRunInput, createdAt: string): AgentRun {
  const id = input.id ? requireId(input.id, "runId") : randomUUID();
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    id,
    userId: requireId(input.userId, "userId"),
    sessionId: requireId(input.sessionId, "sessionId"),
    ...(input.projectId ? { projectId: requireId(input.projectId, "projectId") } : {}),
    ...(input.organizationId
      ? { organizationId: requireId(input.organizationId, "organizationId") }
      : {}),
    input: clone(input.input),
    status: "queued",
    attempt: 0,
    revision: 0,
    createdAt,
    updatedAt: createdAt,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(idempotencyKey
      ? {
          idempotencyScope: input.idempotencyScope ?? defaultScope(input),
          requestHash: requestFingerprint(input),
        }
      : {}),
    ...(input.metadata ? { metadata: clone(input.metadata) } : {}),
  };
}

class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  async run<T>(operation: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.tail;
    this.tail = previous.then(() => gate);
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}

/**
 * Shared state-backed implementation. The file adapter serializes operations
 * within this process; a database adapter can implement the same contract with
 * transactions and row-level leases later.
 */
abstract class StateBackedRunStore implements RunStore {
  private readonly mutex = new AsyncMutex();

  protected abstract loadState(): Promise<PersistedRunState>;
  protected abstract saveState(state: PersistedRunState): Promise<void>;

  private async read<T>(operation: (state: PersistedRunState) => T): Promise<T> {
    return this.mutex.run(async () => clone(operation(await this.loadState())));
  }

  private async write<T>(
    operation: (state: PersistedRunState) => T | Promise<T>,
  ): Promise<T> {
    return this.mutex.run(async () => {
      const state = await this.loadState();
      const result = await operation(state);
      await this.saveState(state);
      return clone(result);
    });
  }

  async createRun(input: CreateRunInput): Promise<RunCreateResult> {
    return this.write((state) => {
      const idempotencyKey = input.idempotencyKey?.trim() || undefined;
      const scope = input.idempotencyScope ?? defaultScope(input);
      const requestHash = idempotencyKey ? requestFingerprint(input) : undefined;

      if (idempotencyKey) {
        const mapKey = scopedKey(scope, idempotencyKey);
        const existingId = state.runIdByIdempotency[mapKey];
        if (existingId) {
          const existing = state.runs[existingId];
          if (!existing) {
            delete state.runIdByIdempotency[mapKey];
          } else {
            if (existing.requestHash && existing.requestHash !== requestHash) {
              throw new RunStoreError(
                "idempotency_conflict",
                `Idempotency key already belongs to a different run: ${idempotencyKey}`,
              );
            }
            return { run: existing, created: false };
          }
        }
      }

      const run = makeRun(input, iso());
      if (state.runs[run.id]) {
        throw new RunStoreError("already_exists", `Run already exists: ${run.id}`);
      }
      state.runs[run.id] = run;
      if (idempotencyKey) {
        state.runIdByIdempotency[scopedKey(scope, idempotencyKey)] = run.id;
      }
      appendEventInState(state, {
        runId: run.id,
        type: "run.created",
        payload: {
          userId: run.userId,
          sessionId: run.sessionId,
          ...(run.projectId ? { projectId: run.projectId } : {}),
          executionMode: run.input.executionMode,
        },
        producer: "run-service",
        idempotencyKey: "run-created",
      });
      return { run, created: true };
    });
  }

  async getRun(runId: string): Promise<AgentRun | null> {
    return this.read((state) => state.runs[runId] ?? null);
  }

  async listRuns(filter: RunListFilter = {}): Promise<AgentRun[]> {
    return this.read((state) => {
      const statuses = filter.statuses ? new Set(filter.statuses) : null;
      const limit = filter.limit && filter.limit > 0 ? Math.floor(filter.limit) : undefined;
      const runs = Object.values(state.runs)
        .filter((run) => !filter.userId || run.userId === filter.userId)
        .filter((run) => !filter.sessionId || run.sessionId === filter.sessionId)
        .filter((run) => !filter.projectId || run.projectId === filter.projectId)
        .filter(
          (run) =>
            !filter.organizationId || run.organizationId === filter.organizationId,
        )
        .filter((run) => !statuses || statuses.has(run.status))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return limit ? runs.slice(0, limit) : runs;
    });
  }

  async updateRun(
    runId: string,
    patch: RunPatch,
    expectedRevision?: number,
  ): Promise<AgentRun> {
    return this.write((state) => {
      const run = getRunOrThrow(state, runId);
      assertRevision(run, expectedRevision);
      if (patch.metadata !== undefined) run.metadata = clone(patch.metadata);
      if (patch.error !== undefined) run.error = clone(patch.error);
      if (patch.cancelRequestedAt !== undefined) {
        run.cancelRequestedAt = patch.cancelRequestedAt;
      }
      if (patch.startedAt !== undefined) run.startedAt = patch.startedAt;
      if (patch.finishedAt !== undefined) run.finishedAt = patch.finishedAt;
      touchRun(run);
      return run;
    });
  }

  async transitionRun(
    runId: string,
    status: RunStatus,
    options: RunTransitionOptions = {},
  ): Promise<AgentRun> {
    return this.write((state) => {
      const run = getRunOrThrow(state, runId);
      assertRevision(run, options.expectedRevision);
      if (run.status === status) return run;
      if (!canTransitionRun(run.status, status)) {
        throw new RunStoreError(
          "invalid_transition",
          `Cannot transition run ${run.id} from ${run.status} to ${status}`,
        );
      }
      const from = run.status;
      run.status = status;
      if (options.metadata !== undefined) run.metadata = clone(options.metadata);
      const now = options.now ?? new Date();
      if (status === "running" && !run.startedAt) run.startedAt = iso(now);
      if (isTerminalRunStatus(status)) {
        run.finishedAt = iso(now);
        delete run.lease;
      }
      if (options.error) run.error = clone(options.error);
      appendEventInState(state, {
        runId,
        type: "run.status_changed",
        payload: {
          from,
          to: status,
          ...(options.reason ? { reason: options.reason } : {}),
          ...(options.error ? { error: clone(options.error) } : {}),
        },
        producer: "run-service",
        occurredAt: now,
      });
      return run;
    });
  }

  async requestCancellation(
    runId: string,
    requestedBy?: string,
    now = new Date(),
  ): Promise<AgentRun> {
    return this.write((state) => {
      const run = getRunOrThrow(state, runId);
      if (isTerminalRunStatus(run.status)) return run;
      if (run.cancelRequestedAt) return run;
      run.cancelRequestedAt = iso(now);
      appendEventInState(state, {
        runId,
        type: "run.cancel_requested",
        payload: requestedBy ? { requestedBy } : {},
        producer: "run-service",
      });
      return run;
    });
  }

  async appendEvent<T extends RunEventType>(
    input: AppendRunEventInput<T>,
  ): Promise<RunEvent<T>> {
    return this.write((state) => appendEventInState(state, input));
  }

  async listEvents(
    runId: string,
    options: ListRunEventsOptions = {},
  ): Promise<RunEvent[]> {
    return this.read((state) => {
      const events = state.events[runId] ?? [];
      const after = options.afterSequence ?? 0;
      const before = options.beforeSequence ?? Number.MAX_SAFE_INTEGER;
      const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;
      const filtered = events.filter(
        (event) => event.sequence > after && event.sequence < before,
      );
      return limit ? filtered.slice(0, limit) : filtered;
    });
  }

  async findRunByIdempotencyKey(
    scope: string,
    idempotencyKey: string,
  ): Promise<AgentRun | null> {
    return this.read((state) => {
      const id = state.runIdByIdempotency[scopedKey(scope, idempotencyKey)];
      return id ? state.runs[id] ?? null : null;
    });
  }

  async acquireLease(
    runId: string,
    ownerId: string,
    options: LeaseOptions = {},
  ): Promise<RunLease | null> {
    return this.write((state) => {
      const run = getRunOrThrow(state, runId);
      requireId(ownerId, "ownerId");
      if (isTerminalRunStatus(run.status) || run.status === "waiting_approval") {
        return null;
      }
      const now = options.now ?? new Date();
      const nowMs = now.getTime();
      if (run.lease && dateMs(run.lease.expiresAt) > nowMs) return null;
      const ttlMs = validateLeaseMs(options.ttlMs ?? DEFAULT_LEASE_MS);
      const lease: RunLease = {
        token: randomUUID(),
        ownerId,
        acquiredAt: iso(now),
        expiresAt: iso(new Date(nowMs + ttlMs)),
      };
      run.lease = lease;
      run.attempt += 1;
      const wasQueued = run.status === "queued";
      if (wasQueued) {
        run.status = "running";
        run.startedAt ??= iso(now);
      }
      if (wasQueued) {
        appendEventInState(state, {
          runId,
          type: "run.status_changed",
          payload: { from: "queued", to: "running", reason: "lease acquired" },
          producer: ownerId,
          occurredAt: now,
        });
      }
      appendEventInState(state, {
        runId,
        type: "run.lease_acquired",
        payload: { ownerId, expiresAt: lease.expiresAt, attempt: run.attempt },
        producer: ownerId,
      });
      return lease;
    });
  }

  async renewLease(
    runId: string,
    token: string,
    options: LeaseOptions = {},
  ): Promise<RunLease | null> {
    return this.write((state) => {
      const run = getRunOrThrow(state, runId);
      const now = options.now ?? new Date();
      if (
        !run.lease ||
        run.lease.token !== token ||
        dateMs(run.lease.expiresAt) <= now.getTime() ||
        isTerminalRunStatus(run.status)
      ) {
        return null;
      }
      const ttlMs = validateLeaseMs(options.ttlMs ?? DEFAULT_LEASE_MS);
      run.lease = {
        ...run.lease,
        expiresAt: iso(new Date(now.getTime() + ttlMs)),
      };
      appendEventInState(state, {
        runId,
        type: "run.lease_renewed",
        payload: { ownerId: run.lease.ownerId, expiresAt: run.lease.expiresAt },
        producer: run.lease.ownerId,
      });
      return run.lease;
    });
  }

  async releaseLease(runId: string, token: string, now = new Date()): Promise<boolean> {
    return this.write((state) => {
      const run = getRunOrThrow(state, runId);
      if (!run.lease || run.lease.token !== token) return false;
      const ownerId = run.lease.ownerId;
      delete run.lease;
      appendEventInState(state, {
        runId,
        type: "run.lease_released",
        payload: { ownerId },
        producer: ownerId,
        occurredAt: now,
      });
      return true;
    });
  }
}

function getRunOrThrow(state: PersistedRunState, runId: string): AgentRun {
  const run = state.runs[runId];
  if (!run) throw new RunStoreError("not_found", `Run not found: ${runId}`);
  return run;
}

function assertRevision(run: AgentRun, expectedRevision?: number): void {
  if (
    expectedRevision !== undefined &&
    (!Number.isInteger(expectedRevision) || run.revision !== expectedRevision)
  ) {
    throw new RunStoreError(
      "revision_conflict",
      `Run ${run.id} changed since revision ${expectedRevision}`,
    );
  }
}

function touchRun(run: AgentRun): void {
  run.revision += 1;
  run.updatedAt = iso();
}

function appendEventInState<T extends RunEventType>(
  state: PersistedRunState,
  input: AppendRunEventInput<T>,
): RunEvent<T> {
  const run = getRunOrThrow(state, input.runId);
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;
  const mapKey = idempotencyKey
    ? scopedKey(input.runId, idempotencyKey)
    : undefined;
  if (mapKey) {
    const existingId = state.eventIdByIdempotency[mapKey];
    if (existingId) {
      const existing = (state.events[input.runId] ?? []).find(
        (event) => event.eventId === existingId,
      );
      if (existing) {
        const expected = eventPayloadFingerprint({
          type: input.type,
          payload: input.payload as JsonValue,
          producer: input.producer,
          correlationId: input.correlationId,
          causationId: input.causationId,
          metadata: input.metadata as JsonValue,
        });
        const actual = eventPayloadFingerprint({
          type: existing.type,
          payload: existing.payload as JsonValue,
          producer: existing.producer,
          correlationId: existing.correlationId,
          causationId: existing.causationId,
          metadata: existing.metadata as JsonValue,
        });
        if (expected !== actual) {
          throw new RunStoreError(
            "idempotency_conflict",
            `Event idempotency key already belongs to a different event: ${idempotencyKey}`,
          );
        }
        return existing as RunEvent<T>;
      }
      delete state.eventIdByIdempotency[mapKey];
    }
  }

  const events = state.events[input.runId] ?? (state.events[input.runId] = []);
  const event = {
    version: RUN_EVENT_VERSION,
    eventId: input.eventId ? requireId(input.eventId, "eventId") : randomUUID(),
    runId: input.runId,
    sequence: events.length + 1,
    type: input.type,
    occurredAt: iso(input.occurredAt ?? new Date()),
    producer: input.producer?.trim() || "run-service",
    payload: clone(input.payload),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.causationId ? { causationId: input.causationId } : {}),
    ...(input.metadata ? { metadata: clone(input.metadata) } : {}),
  } as RunEvent<T>;
  if (events.some((candidate) => candidate.eventId === event.eventId)) {
    throw new RunStoreError("already_exists", `Event already exists: ${event.eventId}`);
  }
  events.push(event);
  if (mapKey) state.eventIdByIdempotency[mapKey] = event.eventId;
  touchRun(run);
  return event;
}

export class MemoryRunStore extends StateBackedRunStore {
  private state: PersistedRunState;

  constructor(initialState?: Partial<PersistedRunState>) {
    super();
    this.state = normalizeState({ ...emptyState(), ...initialState });
  }

  protected async loadState(): Promise<PersistedRunState> {
    return clone(this.state);
  }

  protected async saveState(state: PersistedRunState): Promise<void> {
    this.state = clone(state);
  }
}

/** Creates an isolated in-memory store for tests and local worker wiring. */
export function createMemoryRunStore(): RunStore {
  return new MemoryRunStore();
}

export class FileRunStore extends StateBackedRunStore {
  readonly filePath: string;

  constructor(rootDir: string) {
    super();
    this.filePath = join(rootDir, "runs.json");
    ensureDirectory(rootDir);
  }

  protected async loadState(): Promise<PersistedRunState> {
    if (!existsSync(this.filePath)) return emptyState();
    try {
      return normalizeState(JSON.parse(readFileSync(this.filePath, "utf8")));
    } catch (error) {
      if (error instanceof RunStoreError) throw error;
      throw new RunStoreError(
        "corrupt_store",
        `Unable to read run store ${this.filePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  protected async saveState(state: PersistedRunState): Promise<void> {
    atomicWrite(this.filePath, `${JSON.stringify(state, null, 2)}\n`);
  }
}

/**
 * File-backed run and event log. It is intentionally a small development and
 * single-node adapter; the same `RunStore` contract can later be implemented
 * with PostgreSQL transactions and `SELECT ... FOR UPDATE` leases.
 */
export function createFileRunStore(rootDir: string): RunStore {
  return new FileRunStore(rootDir);
}
