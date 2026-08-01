import { randomUUID } from "node:crypto";
import type {
  DequeueRunJobOptions,
  EnqueueRunJobInput,
  EnqueueRunJobResult,
  NackRunJobOptions,
  RunQueue,
  RunQueueJob,
  RunQueueLease,
} from "./types";

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;

interface InFlight {
  lease: RunQueueLease;
}

interface Waiter {
  resolve: () => void;
}

/**
 * Small FIFO queue for local development and tests.
 *
 * The queue intentionally exposes the same ack/nack/lease shape expected from
 * Redis/BullMQ. It is process-local and loses pending work on restart, while
 * the RunStore remains durable and can be used to rebuild pending jobs.
 */
export class InProcessRunQueue implements RunQueue {
  private readonly pending: RunQueueJob[] = [];
  private readonly inFlight = new Map<string, InFlight>();
  private readonly jobsByIdempotency = new Map<string, RunQueueJob>();
  private readonly dead = new Map<string, RunQueueJob>();
  private readonly waiters = new Set<Waiter>();
  private closed = false;

  async enqueue(input: EnqueueRunJobInput): Promise<EnqueueRunJobResult> {
    if (this.closed) throw new Error("Run queue is closed");
    if (!input.runId.trim()) throw new Error("runId is required");
    const idempotencyKey = input.idempotencyKey?.trim() || undefined;
    if (idempotencyKey) {
      const existing = this.jobsByIdempotency.get(
        queueIdempotencyKey({ runId: input.runId, idempotencyKey }),
      );
      if (existing) return { job: clone(existing), enqueued: false };
    }
    const now = input.now ?? new Date();
    const delayMs = input.delayMs ?? 0;
    const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new Error("delayMs must be zero or a positive number");
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new Error("maxAttempts must be a positive integer");
    }
    const job: RunQueueJob = {
      id: randomUUID(),
      runId: input.runId,
      enqueuedAt: now.toISOString(),
      availableAt: new Date(now.getTime() + delayMs).toISOString(),
      attempt: 0,
      maxAttempts,
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...(input.payload ? { payload: clone(input.payload) } : {}),
    };
    this.pending.push(job);
    if (idempotencyKey) {
      this.jobsByIdempotency.set(queueIdempotencyKey(job), job);
    }
    this.wakeOne();
    return { job: clone(job), enqueued: true };
  }

  async dequeue(options: DequeueRunJobOptions = {}): Promise<RunQueueLease | null> {
    if (this.closed) return null;
    if (options.signal?.aborted) return null;
    const workerId = options.workerId?.trim() || `worker-${randomUUID()}`;
    const leaseMs = validatePositive(options.leaseMs ?? DEFAULT_LEASE_MS, "leaseMs");
    const waitMs = validateNonNegative(options.waitMs ?? 0, "waitMs");
    const deadline = Date.now() + waitMs;

    while (!this.closed) {
      const now = options.now ?? new Date();
      this.reapExpired(now);
      const available = this.takeAvailable(now);
      if (available) {
        const leasedAt = now.toISOString();
        const lease: RunQueueLease = {
          leaseId: randomUUID(),
          workerId,
          job: {
            ...available,
            attempt: available.attempt + 1,
          },
          leasedAt,
          expiresAt: new Date(now.getTime() + leaseMs).toISOString(),
        };
        const stored = {
          ...lease,
          job: clone(lease.job),
        };
        this.inFlight.set(lease.leaseId, { lease: stored });
        // Keep the idempotency record pointed at the newest attempt/job object.
        if (stored.job.idempotencyKey) {
          this.jobsByIdempotency.set(queueIdempotencyKey(stored.job), stored.job);
        }
        return clone(lease);
      }

      if (waitMs <= 0) return null;
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      const woke = await this.waitForWork(
        Math.min(remaining, this.nextAvailableDelay(Date.now())),
        options.signal,
      );
      if (!woke || options.signal?.aborted) return null;
      // A waiter wake-up should use the current wall clock so delayed jobs and
      // expired leases are evaluated correctly. Explicit `now` is intended for
      // non-blocking deterministic tests.
      options = { ...options, now: undefined };
    }
    return null;
  }

  async ack(leaseId: string): Promise<boolean> {
    const inFlight = this.inFlight.get(leaseId);
    if (!inFlight) return false;
    this.inFlight.delete(leaseId);
    return true;
  }

  async renew(
    leaseId: string,
    options: { leaseMs?: number; now?: Date } = {},
  ): Promise<RunQueueLease | null> {
    const now = options.now ?? new Date();
    this.reapExpired(now);
    const inFlight = this.inFlight.get(leaseId);
    if (!inFlight) return null;
    const leaseMs = validatePositive(options.leaseMs ?? DEFAULT_LEASE_MS, "leaseMs");
    inFlight.lease = {
      ...inFlight.lease,
      expiresAt: new Date(now.getTime() + leaseMs).toISOString(),
    };
    return clone(inFlight.lease);
  }

  async nack(leaseId: string, options: NackRunJobOptions = {}): Promise<boolean> {
    const inFlight = this.inFlight.get(leaseId);
    if (!inFlight) return false;
    const delayMs = options.delayMs ?? 0;
    if (!Number.isFinite(delayMs) || delayMs < 0) {
      throw new Error("delayMs must be zero or a positive number");
    }
    this.inFlight.delete(leaseId);
    const original = inFlight.lease.job;
    const now = options.now ?? new Date();
    const shouldRequeue = options.requeue !== false;
    if (
      shouldRequeue &&
      original.attempt < original.maxAttempts &&
      !this.closed
    ) {
      const job: RunQueueJob = {
        ...original,
        availableAt: new Date(now.getTime() + delayMs).toISOString(),
      };
      this.pending.push(job);
      if (job.idempotencyKey) {
        this.jobsByIdempotency.set(queueIdempotencyKey(job), job);
      }
      this.wakeOne();
    } else {
      this.dead.set(original.id, clone(original));
    }
    return true;
  }

  async size(): Promise<number> {
    this.reapExpired(new Date());
    return this.pending.length + this.inFlight.size;
  }

  async deadLetters(): Promise<RunQueueJob[]> {
    this.reapExpired(new Date());
    return [...this.dead.values()].map(clone);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters) waiter.resolve();
    this.waiters.clear();
  }

  private takeAvailable(now: Date): RunQueueJob | null {
    const nowMs = now.getTime();
    const index = this.pending.findIndex(
      (job) => Date.parse(job.availableAt) <= nowMs,
    );
    if (index < 0) return null;
    const [job] = this.pending.splice(index, 1);
    return job ? clone(job) : null;
  }

  private reapExpired(now: Date): void {
    const nowMs = now.getTime();
    for (const [leaseId, inFlight] of this.inFlight) {
      if (Date.parse(inFlight.lease.expiresAt) > nowMs) continue;
      this.inFlight.delete(leaseId);
      const job = inFlight.lease.job;
      if (job.attempt < job.maxAttempts && !this.closed) {
        this.pending.push({ ...job, availableAt: now.toISOString() });
        if (job.idempotencyKey) {
          this.jobsByIdempotency.set(queueIdempotencyKey(job), job);
        }
      } else {
        this.dead.set(job.id, clone(job));
      }
    }
    if (this.pending.length > 0) this.wakeOne();
  }

  private wakeOne(): void {
    const waiter = this.waiters.values().next().value as Waiter | undefined;
    if (!waiter) return;
    this.waiters.delete(waiter);
    waiter.resolve();
  }

  private nextAvailableDelay(nowMs: number): number {
    let delay = Number.POSITIVE_INFINITY;
    for (const job of this.pending) {
      const availableAt = Date.parse(job.availableAt);
      if (availableAt <= nowMs) return 0;
      delay = Math.min(delay, availableAt - nowMs);
    }
    return delay;
  }

  private waitForWork(timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const waiter: Waiter = {
        resolve: () => finish(true),
      };
      // This timer wakes the consumer so it can re-check delayed jobs. The
      // caller owns the overall deadline and decides whether to return null.
      const timer = setTimeout(() => finish(true), timeoutMs);
      const onAbort = () => finish(false);
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        this.waiters.delete(waiter);
        resolve(value);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) {
        finish(false);
      } else {
        this.waiters.add(waiter);
      }
    });
  }
}

function validatePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`);
  return value;
}

function validateNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be zero or positive`);
  return value;
}

function queueIdempotencyKey(
  job: Pick<RunQueueJob, "runId" | "idempotencyKey">,
): string {
  return `${job.runId}\u0000${job.idempotencyKey ?? ""}`;
}

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Factory kept separate so a Redis/BullMQ adapter can replace it later. */
export function createInProcessRunQueue(): RunQueue {
  return new InProcessRunQueue();
}
