import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
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
const RUN_FILE_VERSION = 1;
const INDEX_VERSION = 1;

/** One run's full state: the run row plus its append-only event log. */
interface RunRecord {
  version: typeof RUN_FILE_VERSION;
  run: AgentRun;
  events: RunEvent[];
  eventIdByIdempotency: Record<string, string>;
}

/** Lightweight cross-run index. Never holds event bodies. */
interface RunIndexEntry {
  userId: string;
  sessionId: string;
  projectId?: string;
  organizationId?: string;
  status: RunStatus;
}

interface RunIndexState {
  version: typeof INDEX_VERSION;
  runIdByIdempotency: Record<string, string>;
  runs: Record<string, RunIndexEntry>;
}

function emptyIndex(): RunIndexState {
  return { version: INDEX_VERSION, runIdByIdempotency: {}, runs: {} };
}

function emptyRunRecord(run: AgentRun): RunRecord {
  return { version: RUN_FILE_VERSION, run, events: [], eventIdByIdempotency: {} };
}

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeIndex(value: unknown): RunIndexState {
  if (!value || typeof value !== "object") return emptyIndex();
  const raw = value as Partial<RunIndexState>;
  if (raw.version === undefined) return emptyIndex();
  if (raw.version !== INDEX_VERSION) {
    throw new RunStoreError(
      "unsupported_version",
      `Unsupported run index version: ${String(raw.version)}`,
    );
  }
  return {
    version: INDEX_VERSION,
    runIdByIdempotency:
      raw.runIdByIdempotency && typeof raw.runIdByIdempotency === "object"
        ? raw.runIdByIdempotency
        : {},
    runs: raw.runs && typeof raw.runs === "object" ? raw.runs : {},
  };
}

function normalizeRunRecord(value: unknown): RunRecord {
  const raw = value as Partial<RunRecord> | null;
  if (!raw || typeof raw !== "object" || raw.version === undefined) {
    throw new RunStoreError("corrupt_store", "Run file is missing a version");
  }
  if (raw.version !== RUN_FILE_VERSION) {
    throw new RunStoreError(
      "unsupported_version",
      `Unsupported run file version: ${String(raw.version)}`,
    );
  }
  if (!raw.run) {
    throw new RunStoreError("corrupt_store", "Run file is missing its run row");
  }
  return {
    version: RUN_FILE_VERSION,
    run: raw.run,
    events: Array.isArray(raw.events) ? raw.events : [],
    eventIdByIdempotency:
      raw.eventIdByIdempotency && typeof raw.eventIdByIdempotency === "object"
        ? raw.eventIdByIdempotency
        : {},
  };
}

function indexEntryFor(run: AgentRun): RunIndexEntry {
  return {
    userId: run.userId,
    sessionId: run.sessionId,
    ...(run.projectId ? { projectId: run.projectId } : {}),
    ...(run.organizationId ? { organizationId: run.organizationId } : {}),
    status: run.status,
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

function touchRun(run: AgentRun): void {
  run.revision += 1;
  run.updatedAt = iso();
}

function appendEventInRecord<T extends RunEventType>(
  record: RunRecord,
  input: AppendRunEventInput<T>,
): RunEvent<T> {
  const idempotencyKey = input.idempotencyKey?.trim() || undefined;
  if (idempotencyKey) {
    const existingId = record.eventIdByIdempotency[idempotencyKey];
    if (existingId) {
      const existing = record.events.find((event) => event.eventId === existingId);
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
      delete record.eventIdByIdempotency[idempotencyKey];
    }
  }

  const event = {
    version: RUN_EVENT_VERSION,
    eventId: input.eventId ? requireId(input.eventId, "eventId") : randomUUID(),
    runId: input.runId,
    sequence: record.events.length + 1,
    type: input.type,
    occurredAt: iso(input.occurredAt ?? new Date()),
    producer: input.producer?.trim() || "run-service",
    payload: clone(input.payload),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(input.correlationId ? { correlationId: input.correlationId } : {}),
    ...(input.causationId ? { causationId: input.causationId } : {}),
    ...(input.metadata ? { metadata: clone(input.metadata) } : {}),
  } as RunEvent<T>;
  if (record.events.some((candidate) => candidate.eventId === event.eventId)) {
    throw new RunStoreError("already_exists", `Event already exists: ${event.eventId}`);
  }
  record.events.push(event);
  if (idempotencyKey) record.eventIdByIdempotency[idempotencyKey] = event.eventId;
  touchRun(record.run);
  return event;
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
 * Storage is partitioned per run: one small index (run metadata + the
 * idempotency lookup) plus one record per run (that run's own event log).
 * A hot per-token append only ever touches its own run's record, so cost
 * stays bounded by that run's own history instead of the whole app's.
 */
abstract class PartitionedRunStore implements RunStore {
  private readonly indexMutex = new AsyncMutex();
  private readonly runMutexes = new Map<string, AsyncMutex>();

  protected abstract loadIndex(): Promise<RunIndexState>;
  protected abstract saveIndex(state: RunIndexState): Promise<void>;
  protected abstract loadRun(runId: string): Promise<RunRecord | null>;
  protected abstract saveRun(runId: string, record: RunRecord): Promise<void>;

  private runMutex(runId: string): AsyncMutex {
    let mutex = this.runMutexes.get(runId);
    if (!mutex) {
      mutex = new AsyncMutex();
      this.runMutexes.set(runId, mutex);
    }
    return mutex;
  }

  private async readIndex<T>(operation: (state: RunIndexState) => T): Promise<T> {
    return this.indexMutex.run(async () => clone(operation(await this.loadIndex())));
  }

  private async writeIndex<T>(
    operation: (state: RunIndexState) => T | Promise<T>,
  ): Promise<T> {
    return this.indexMutex.run(async () => {
      const state = await this.loadIndex();
      const result = await operation(state);
      await this.saveIndex(state);
      return clone(result);
    });
  }

  private async readRun<T>(
    runId: string,
    operation: (record: RunRecord) => T,
  ): Promise<T | null> {
    return this.runMutex(runId).run(async () => {
      const record = await this.loadRun(runId);
      return record ? clone(operation(record)) : null;
    });
  }

  private async writeRun<T>(
    runId: string,
    operation: (record: RunRecord) => T | Promise<T>,
  ): Promise<T> {
    return this.runMutex(runId).run(async () => {
      const record = await this.loadRun(runId);
      if (!record) throw new RunStoreError("not_found", `Run not found: ${runId}`);
      const result = await operation(record);
      await this.saveRun(runId, record);
      return clone(result);
    });
  }

  private async syncIndexStatus(run: AgentRun): Promise<void> {
    await this.writeIndex((state) => {
      state.runs[run.id] = indexEntryFor(run);
    });
  }

  async createRun(input: CreateRunInput): Promise<RunCreateResult> {
    const idempotencyKey = input.idempotencyKey?.trim() || undefined;
    const scope = input.idempotencyScope ?? defaultScope(input);
    const requestHash = idempotencyKey ? requestFingerprint(input) : undefined;
    const mapKey = idempotencyKey ? scopedKey(scope, idempotencyKey) : undefined;

    // The whole check-then-create-then-register sequence must be one
    // critical section: two concurrent callers with the same idempotency
    // key must not both observe "not found" and each create a run. Every
    // index read/write below goes straight through loadIndex/saveIndex
    // (never the readIndex/writeIndex helpers, which would re-enter this
    // same mutex and deadlock).
    return this.indexMutex.run(async () => {
      const state = await this.loadIndex();

      if (mapKey) {
        const existingId = state.runIdByIdempotency[mapKey];
        if (existingId) {
          const existingRun = await this.readRun(existingId, (record) => record.run);
          if (existingRun) {
            if (existingRun.requestHash && existingRun.requestHash !== requestHash) {
              throw new RunStoreError(
                "idempotency_conflict",
                `Idempotency key already belongs to a different run: ${idempotencyKey}`,
              );
            }
            return clone({ run: existingRun, created: false });
          }
          // Index pointed at a run file that no longer exists; drop the
          // stale mapping and fall through to create a fresh run.
          delete state.runIdByIdempotency[mapKey];
        }
      }

      const run = makeRun(input, iso());
      const record = emptyRunRecord(run);
      appendEventInRecord(record, {
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

      await this.runMutex(run.id).run(async () => {
        const existing = await this.loadRun(run.id);
        if (existing) throw new RunStoreError("already_exists", `Run already exists: ${run.id}`);
        await this.saveRun(run.id, record);
      });
      if (mapKey) state.runIdByIdempotency[mapKey] = run.id;
      state.runs[run.id] = indexEntryFor(run);
      await this.saveIndex(state);
      return clone({ run: record.run, created: true });
    });
  }

  async getRun(runId: string): Promise<AgentRun | null> {
    return this.readRun(runId, (record) => record.run);
  }

  async listRuns(filter: RunListFilter = {}): Promise<AgentRun[]> {
    const entries = await this.readIndex((state) => Object.entries(state.runs));
    const statuses = filter.statuses ? new Set(filter.statuses) : null;
    const limit = filter.limit && filter.limit > 0 ? Math.floor(filter.limit) : undefined;
    const matched = entries
      .filter(([, meta]) => !filter.userId || meta.userId === filter.userId)
      .filter(([, meta]) => !filter.sessionId || meta.sessionId === filter.sessionId)
      .filter(([, meta]) => !filter.projectId || meta.projectId === filter.projectId)
      .filter(
        ([, meta]) => !filter.organizationId || meta.organizationId === filter.organizationId,
      )
      .filter(([, meta]) => !statuses || statuses.has(meta.status))
      .map(([runId]) => runId);

    const runs = await Promise.all(matched.map((runId) => this.readRun(runId, (r) => r.run)));
    const found = runs.filter((run): run is AgentRun => run !== null);
    found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return limit ? found.slice(0, limit) : found;
  }

  async updateRun(
    runId: string,
    patch: RunPatch,
    expectedRevision?: number,
  ): Promise<AgentRun> {
    return this.writeRun(runId, (record) => {
      const { run } = record;
      assertRevision(run, expectedRevision);
      if (patch.metadata !== undefined) run.metadata = clone(patch.metadata);
      if (patch.error !== undefined) run.error = clone(patch.error);
      if (patch.cancelRequestedAt !== undefined) run.cancelRequestedAt = patch.cancelRequestedAt;
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
    const run = await this.writeRun(runId, (record) => {
      assertRevision(record.run, options.expectedRevision);
      if (record.run.status === status) return record.run;
      if (!canTransitionRun(record.run.status, status)) {
        throw new RunStoreError(
          "invalid_transition",
          `Cannot transition run ${record.run.id} from ${record.run.status} to ${status}`,
        );
      }
      const from = record.run.status;
      record.run.status = status;
      if (options.metadata !== undefined) record.run.metadata = clone(options.metadata);
      const now = options.now ?? new Date();
      if (status === "running" && !record.run.startedAt) record.run.startedAt = iso(now);
      if (isTerminalRunStatus(status)) {
        record.run.finishedAt = iso(now);
        delete record.run.lease;
      }
      if (options.error) record.run.error = clone(options.error);
      appendEventInRecord(record, {
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
      return record.run;
    });
    await this.syncIndexStatus(run);
    return run;
  }

  async requestCancellation(
    runId: string,
    requestedBy?: string,
    now = new Date(),
  ): Promise<AgentRun> {
    return this.writeRun(runId, (record) => {
      const { run } = record;
      if (isTerminalRunStatus(run.status)) return run;
      if (run.cancelRequestedAt) return run;
      run.cancelRequestedAt = iso(now);
      appendEventInRecord(record, {
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
    return this.writeRun(input.runId, (record) => appendEventInRecord(record, input));
  }

  async listEvents(runId: string, options: ListRunEventsOptions = {}): Promise<RunEvent[]> {
    const events = await this.readRun(runId, (record) => record.events);
    if (!events) return [];
    const after = options.afterSequence ?? 0;
    const before = options.beforeSequence ?? Number.MAX_SAFE_INTEGER;
    const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;
    const filtered = events.filter(
      (event) => event.sequence > after && event.sequence < before,
    );
    return limit ? filtered.slice(0, limit) : filtered;
  }

  async findRunByIdempotencyKey(
    scope: string,
    idempotencyKey: string,
  ): Promise<AgentRun | null> {
    const runId = await this.readIndex(
      (state) => state.runIdByIdempotency[scopedKey(scope, idempotencyKey)],
    );
    return runId ? this.readRun(runId, (record) => record.run) : null;
  }

  async acquireLease(
    runId: string,
    ownerId: string,
    options: LeaseOptions = {},
  ): Promise<RunLease | null> {
    const result = await this.writeRun(runId, (record) => {
      const { run } = record;
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
        appendEventInRecord(record, {
          runId,
          type: "run.status_changed",
          payload: { from: "queued", to: "running", reason: "lease acquired" },
          producer: ownerId,
          occurredAt: now,
        });
      }
      appendEventInRecord(record, {
        runId,
        type: "run.lease_acquired",
        payload: { ownerId, expiresAt: lease.expiresAt, attempt: run.attempt },
        producer: ownerId,
      });
      return lease;
    });
    const run = await this.readRun(runId, (record) => record.run);
    if (run) await this.syncIndexStatus(run);
    return result;
  }

  async renewLease(
    runId: string,
    token: string,
    options: LeaseOptions = {},
  ): Promise<RunLease | null> {
    return this.writeRun(runId, (record) => {
      const { run } = record;
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
      run.lease = { ...run.lease, expiresAt: iso(new Date(now.getTime() + ttlMs)) };
      appendEventInRecord(record, {
        runId,
        type: "run.lease_renewed",
        payload: { ownerId: run.lease.ownerId, expiresAt: run.lease.expiresAt },
        producer: run.lease.ownerId,
      });
      return run.lease;
    });
  }

  async releaseLease(runId: string, token: string, now = new Date()): Promise<boolean> {
    return this.writeRun(runId, (record) => {
      const { run } = record;
      if (!run.lease || run.lease.token !== token) return false;
      const ownerId = run.lease.ownerId;
      delete run.lease;
      appendEventInRecord(record, {
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

export class MemoryRunStore extends PartitionedRunStore {
  private index: RunIndexState = emptyIndex();
  private readonly runs = new Map<string, RunRecord>();

  protected async loadIndex(): Promise<RunIndexState> {
    return clone(this.index);
  }

  protected async saveIndex(state: RunIndexState): Promise<void> {
    this.index = clone(state);
  }

  protected async loadRun(runId: string): Promise<RunRecord | null> {
    const record = this.runs.get(runId);
    return record ? clone(record) : null;
  }

  protected async saveRun(runId: string, record: RunRecord): Promise<void> {
    this.runs.set(runId, clone(record));
  }
}

/** Creates an isolated in-memory store for tests and local worker wiring. */
export function createMemoryRunStore(): RunStore {
  return new MemoryRunStore();
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function atomicWriteAsync(path: string, value: string): Promise<void> {
  await ensureDirectory(dirname(path));
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, value, "utf8");
    await rename(temporary, path);
  } catch (error) {
    try {
      await unlink(temporary);
    } catch {
      // Cleanup is best effort; surface the original error below.
    }
    throw error;
  }
}

async function readJsonFile(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * File-backed run store, partitioned as one `index.json` (run metadata and
 * the idempotency lookup) plus one `runs/<runId>.json` per run (that run's
 * own append-only event log). Streaming a run's events only ever reads and
 * rewrites its own small file, so cost stays bounded by that run's history
 * instead of the whole store's, and disk I/O is fully async so it never
 * blocks the process's event loop.
 */
export class FileRunStore extends PartitionedRunStore {
  private readonly rootDir: string;
  private readonly runsDir: string;
  private readonly indexPath: string;

  constructor(rootDir: string) {
    super();
    this.rootDir = rootDir;
    this.runsDir = join(rootDir, "runs");
    this.indexPath = join(rootDir, "index.json");
  }

  private runFilePath(runId: string): string {
    return join(this.runsDir, `${requireId(runId, "runId")}.json`);
  }

  protected async loadIndex(): Promise<RunIndexState> {
    const raw = await readJsonFile(this.indexPath);
    return raw === undefined ? emptyIndex() : normalizeIndex(raw);
  }

  protected async saveIndex(state: RunIndexState): Promise<void> {
    await ensureDirectory(this.rootDir);
    await atomicWriteAsync(this.indexPath, JSON.stringify(state));
  }

  protected async loadRun(runId: string): Promise<RunRecord | null> {
    const raw = await readJsonFile(this.runFilePath(runId));
    return raw === undefined ? null : normalizeRunRecord(raw);
  }

  protected async saveRun(runId: string, record: RunRecord): Promise<void> {
    await ensureDirectory(this.runsDir);
    await atomicWriteAsync(this.runFilePath(runId), JSON.stringify(record));
  }
}

/**
 * Creates a file-backed run and event log, partitioned per run. It is
 * intentionally a small development and single-node adapter; the same
 * `RunStore` contract can later be implemented with PostgreSQL transactions
 * and `SELECT ... FOR UPDATE` leases.
 */
export function createFileRunStore(rootDir: string): RunStore {
  return new FileRunStore(rootDir);
}
