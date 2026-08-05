import { describe, expect, it } from "vitest";
import { createInProcessRunQueue } from "./queue";
import { createMemoryRunStore } from "./run-store";
import { recoverLocalRunQueue } from "./service";

function request() {
  return {
    userId: "user-1",
    sessionId: "session-1",
    input: {
      message: "Make the change",
      executionMode: "ai-sdk" as const,
      model: "gpt-4o-mini",
    },
  };
}

describe("local run recovery", () => {
  it("requeues work that never started", async () => {
    const store = createMemoryRunStore();
    const queue = createInProcessRunQueue();
    const { run } = await store.createRun(request());

    await recoverLocalRunQueue({ store, queue, maxAttempts: 3 });

    const lease = await queue.dequeue({ workerId: "worker-1" });
    expect(lease?.job.runId).toBe(run.id);
    expect((await store.getRun(run.id))?.status).toBe("queued");
  });

  it("fails an interrupted in-flight run instead of replaying its side effects", async () => {
    const store = createMemoryRunStore();
    const queue = createInProcessRunQueue();
    const { run } = await store.createRun(request());
    await store.acquireLease(run.id, "previous-worker", { ttlMs: 60_000 });

    await recoverLocalRunQueue({ store, queue, maxAttempts: 3 });

    const recovered = await store.getRun(run.id);
    expect(recovered).toMatchObject({
      status: "failed",
      error: expect.objectContaining({ code: "worker_interrupted", retryable: false }),
    });
    expect(recovered?.lease).toBeUndefined();
    expect(await queue.dequeue({ workerId: "worker-1" })).toBeNull();
  });

  it("finalizes a Workflow Run with a durable completed event without replaying it", async () => {
    const store = createMemoryRunStore();
    const queue = createInProcessRunQueue();
    const { run } = await store.createRun({
      ...request(),
      metadata: { production: { workflowId: "workflow-1" } },
    });
    await store.acquireLease(run.id, "previous-worker", { ttlMs: 60_000 });
    await store.appendEvent({
      runId: run.id,
      type: "agent.event",
      payload: { event: { type: "done", reason: "completed" } },
      producer: "executor:ai-sdk",
    });
    const finalized: string[] = [];

    await recoverLocalRunQueue({
      store,
      queue,
      maxAttempts: 3,
      workflowFinalizer: {
        async completeRun(runId) {
          finalized.push(runId);
          return store.transitionRun(runId, "completed");
        },
      },
    });

    expect(finalized).toEqual([run.id]);
    expect((await store.getRun(run.id))?.status).toBe("completed");
    expect(await queue.dequeue({ workerId: "worker-1" })).toBeNull();
  });
});
