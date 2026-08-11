import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFileRunStore,
  createMemoryRunStore,
} from "./run-store";

function input(message = "build a plan") {
  return {
    userId: "user-1",
    sessionId: "session-1",
    projectId: "project-1",
    input: {
      message,
      executionMode: "ai-sdk" as const,
      model: "gpt-4o-mini",
    },
    idempotencyKey: "request-1",
  };
}

describe("run store", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories) {
      rmSync(directory, { recursive: true, force: true });
    }
    directories.length = 0;
  });

  it("deduplicates create requests and rejects key reuse with different input", async () => {
    const store = createMemoryRunStore();
    const first = await store.createRun(input());
    const duplicate = await store.createRun(input());

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.run.id).toBe(first.run.id);

    await expect(store.createRun(input("different request"))).rejects.toMatchObject({
      code: "idempotency_conflict",
    });
  });

  it("writes versioned, ordered events and deduplicates event retries", async () => {
    const store = createMemoryRunStore();
    const { run } = await store.createRun(input());
    const first = await store.appendEvent({
      runId: run.id,
      type: "custom",
      payload: { phase: "started" },
      idempotencyKey: "phase-started",
      producer: "worker-1",
    });
    const retry = await store.appendEvent({
      runId: run.id,
      type: "custom",
      payload: { phase: "started" },
      idempotencyKey: "phase-started",
      producer: "worker-1",
    });
    const second = await store.appendEvent({
      runId: run.id,
      type: "agent.event",
      payload: { event: { type: "text_delta", text: "ok" } },
    });

    expect(first.version).toBe(1);
    expect(first.sequence).toBe(2); // sequence 1 is run.created
    expect(retry.eventId).toBe(first.eventId);
    expect(second.sequence).toBe(3);
    expect((await store.listEvents(run.id, { afterSequence: 1 })).map((e) => e.sequence)).toEqual([
      2,
      3,
    ]);

    await expect(
      store.appendEvent({
        runId: run.id,
        type: "custom",
        payload: { phase: "different" },
        idempotencyKey: "phase-started",
        producer: "worker-1",
      }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("enforces lifecycle transitions, cancellation, and optimistic revisions", async () => {
    const store = createMemoryRunStore();
    const { run } = await store.createRun({ ...input(), idempotencyKey: undefined });
    const running = await store.transitionRun(run.id, "running", {
      expectedRevision: run.revision,
      reason: "worker accepted",
    });
    expect(running.status).toBe("running");
    expect(running.startedAt).toBeTruthy();

    await expect(
      store.transitionRun(run.id, "completed", { expectedRevision: run.revision - 1 }),
    ).rejects.toMatchObject({ code: "revision_conflict" });

    const cancelled = await store.requestCancellation(run.id, "user-1");
    expect(cancelled.cancelRequestedAt).toBeTruthy();
    const finished = await store.transitionRun(run.id, "cancelled", {
      reason: "user requested stop",
    });
    expect(finished.status).toBe("cancelled");
    expect(finished.finishedAt).toBeTruthy();
    await expect(store.transitionRun(run.id, "running")).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });

  it("provides expiring, renewable, owner-bound leases", async () => {
    const store = createMemoryRunStore();
    const { run } = await store.createRun({ ...input(), idempotencyKey: undefined });
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const lease = await store.acquireLease(run.id, "worker-a", {
      now: t0,
      ttlMs: 1_000,
    });
    expect(lease?.ownerId).toBe("worker-a");
    expect(await store.acquireLease(run.id, "worker-b", { now: t0, ttlMs: 1_000 })).toBeNull();
    expect(await store.renewLease(run.id, lease!.token, { now: new Date("2026-01-01T00:00:00.500Z"), ttlMs: 2_000 })).toMatchObject({
      ownerId: "worker-a",
      expiresAt: "2026-01-01T00:00:02.500Z",
    });
    expect(await store.releaseLease(run.id, "wrong-token")).toBe(false);
    expect(await store.releaseLease(run.id, lease!.token)).toBe(true);
    const replacement = await store.acquireLease(run.id, "worker-b", { now: t0, ttlMs: 1_000 });
    expect(replacement?.ownerId).toBe("worker-b");
  });

  it("survives a store instance restart", async () => {
    const root = mkdtempSync(join(tmpdir(), "reizo-runs-"));
    directories.push(root);
    const first = createFileRunStore(root);
    const created = await first.createRun(input());
    await first.appendEvent({
      runId: created.run.id,
      type: "custom",
      payload: { persisted: true },
      idempotencyKey: "persisted-event",
    });

    const restarted = createFileRunStore(root);
    const loaded = await restarted.getRun(created.run.id);
    const events = await restarted.listEvents(created.run.id);
    expect(loaded?.id).toBe(created.run.id);
    expect(events.at(-1)?.payload).toEqual({ persisted: true });
    expect((await restarted.createRun(input())).created).toBe(false);
  });

  it("does not silently reset an unsupported durable store version", async () => {
    const root = mkdtempSync(join(tmpdir(), "reizo-runs-version-"));
    directories.push(root);
    writeFileSync(join(root, "index.json"), JSON.stringify({ version: 999 }));
    await expect(createFileRunStore(root).listRuns()).rejects.toMatchObject({
      code: "unsupported_version",
    });
  });

  it("partitions storage per run so one run's event volume never touches another run's file", async () => {
    const root = mkdtempSync(join(tmpdir(), "reizo-runs-partition-"));
    directories.push(root);
    const store = createFileRunStore(root);
    const a = await store.createRun(input());
    const b = await store.createRun({
      ...input(),
      sessionId: "session-2",
      idempotencyKey: "request-2",
    });

    for (let i = 0; i < 50; i++) {
      await store.appendEvent({
        runId: a.run.id,
        type: "agent.event",
        payload: { event: { type: "text_delta", text: `chunk-${i}` } },
      });
    }

    // No monolithic all-runs file: each run gets its own bounded file.
    expect(existsSync(join(root, "runs.json"))).toBe(false);
    const bFile = JSON.parse(
      readFileSync(join(root, "runs", `${b.run.id}.json`), "utf8"),
    ) as { events: unknown[] };
    // Run B's file only ever held its own creation event, unaffected by
    // however much run A has streamed since.
    expect(bFile.events).toHaveLength(1);

    const aEvents = await store.listEvents(a.run.id);
    expect(aEvents).toHaveLength(51); // run.created + 50 deltas
  });
});
