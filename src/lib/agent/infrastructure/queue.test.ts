import { describe, expect, it } from "vitest";
import { createInProcessRunQueue } from "./queue";

describe("in-process run queue", () => {
  it("delivers FIFO jobs and acknowledges a lease", async () => {
    const queue = createInProcessRunQueue();
    const one = await queue.enqueue({ runId: "run-1" });
    const two = await queue.enqueue({ runId: "run-2" });
    const first = await queue.dequeue({ workerId: "worker-1" });
    const second = await queue.dequeue({ workerId: "worker-1" });

    expect(first?.job.id).toBe(one.job.id);
    expect(second?.job.id).toBe(two.job.id);
    expect(await queue.ack(first!.leaseId)).toBe(true);
    expect(await queue.ack(first!.leaseId)).toBe(false);
    expect(await queue.size()).toBe(1);
    queue.close();
  });

  it("deduplicates enqueue retries and requeues nacks up to max attempts", async () => {
    const queue = createInProcessRunQueue();
    const first = await queue.enqueue({
      runId: "run-1",
      idempotencyKey: "job-1",
      maxAttempts: 2,
    });
    const duplicate = await queue.enqueue({
      runId: "run-1",
      idempotencyKey: "job-1",
      maxAttempts: 2,
    });
    expect(duplicate.enqueued).toBe(false);
    expect(duplicate.job.id).toBe(first.job.id);

    const attemptOne = await queue.dequeue({ workerId: "worker-1" });
    expect(attemptOne?.job.attempt).toBe(1);
    expect(await queue.nack(attemptOne!.leaseId)).toBe(true);
    const attemptTwo = await queue.dequeue({ workerId: "worker-1" });
    expect(attemptTwo?.job.attempt).toBe(2);
    expect(await queue.nack(attemptTwo!.leaseId)).toBe(true);
    expect(await queue.deadLetters()).toHaveLength(1);
  });

  it("scopes idempotency keys to their run", async () => {
    const queue = createInProcessRunQueue();
    const one = await queue.enqueue({ runId: "run-1", idempotencyKey: "same-key" });
    const two = await queue.enqueue({ runId: "run-2", idempotencyKey: "same-key" });
    expect(two.enqueued).toBe(true);
    expect(two.job.id).not.toBe(one.job.id);
  });

  it("requeues an expired lease and supports delayed work", async () => {
    const queue = createInProcessRunQueue();
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    await queue.enqueue({ runId: "run-1", now: t0, delayMs: 100 });
    expect(await queue.dequeue({ now: t0 })).toBeNull();
    const delayed = await queue.dequeue({ now: new Date("2026-01-01T00:00:00.100Z") });
    expect(delayed?.job.attempt).toBe(1);
    const expired = await queue.dequeue({ now: new Date("2026-01-01T00:00:31.000Z"), leaseMs: 1 });
    expect(expired?.job.attempt).toBe(2);
    await queue.ack(expired!.leaseId);
  });

  it("renews a queue lease before its visibility timeout", async () => {
    const queue = createInProcessRunQueue();
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    await queue.enqueue({ runId: "run-1", now: t0 });
    const lease = await queue.dequeue({ now: t0, leaseMs: 100 });
    const renewed = await queue.renew(lease!.leaseId, {
      now: new Date("2026-01-01T00:00:00.050Z"),
      leaseMs: 1_000,
    });
    expect(renewed?.expiresAt).toBe("2026-01-01T00:00:01.050Z");
    expect(await queue.dequeue({ now: new Date("2026-01-01T00:00:00.200Z") })).toBeNull();
    expect(await queue.ack(lease!.leaseId)).toBe(true);
  });

  it("wakes a waiting consumer when a job arrives", async () => {
    const queue = createInProcessRunQueue();
    const waiting = queue.dequeue({ waitMs: 500, workerId: "worker-1" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await queue.enqueue({ runId: "run-1" });
    const lease = await waiting;
    expect(lease?.job.runId).toBe("run-1");
    queue.close();
  });
});
