import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type {
  AgentExecutionInput,
  AgentExecutionRetrySafety,
  AgentExecutor,
} from "@/lib/agent/executor/types";
import type { AgentSseEvent } from "@/lib/agent/types";
import { createWebFileStore } from "@/lib/host/web/file-store";
import { getProductionPack } from "@/lib/agent/production-packs/registry";
import { createWorkflowSessionBinding } from "@/lib/agent/production-packs/session-binding";
import {
  prepareFirstProductionStage,
  serializeProductionRunMetadata,
} from "@/lib/agent/production-packs/run-metadata";
import { ProductionWorkflowExecution } from "@/lib/agent/production-packs/workflow-execution";
import { RunCoordinator } from "./coordinator";
import { createStaticRunPolicy } from "./policy";
import { createInProcessRunQueue } from "./queue";
import { createMemoryRunStore } from "./run-store";
import type { RunStore } from "./types";

function createExecutor(
  produce: (input: AgentExecutionInput) => AsyncGenerator<AgentSseEvent, void, undefined>,
  retrySafety: AgentExecutionRetrySafety = "at-most-once",
): AgentExecutor {
  return {
    mode: "ai-sdk",
    retrySafety,
    async *execute(input) {
      yield* produce(input);
    },
  };
}

describe("RunCoordinator", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories) {
      rmSync(directory, { recursive: true, force: true });
    }
    directories.length = 0;
  });

  async function setup(
    factory: () => AgentExecutor,
    policy = createStaticRunPolicy({
      allowedExecutionModes: ["ai-sdk"],
      allowedModels: ["gpt-4o-mini"],
    }),
    store: RunStore = createMemoryRunStore(),
  ) {
    const root = mkdtempSync(join(tmpdir(), "winlume-coordinator-"));
    directories.push(root);
    const host = createWebFileStore(root);
    await host.sessions.createSession({
      id: "session-1",
      userId: "user-1",
      title: "Test session",
      model: "gpt-4o-mini",
    });
    const coordinator = new RunCoordinator({
      store,
      queue: createInProcessRunQueue(),
      sessions: host.sessions,
      projects: host.projects,
      artifacts: host.artifacts,
      policy,
      executorFactory: () => factory(),
      retryDelayMs: 0,
    });
    return coordinator;
  }

  function request(idempotencyKey = "request-1") {
    return {
      userId: "user-1",
      sessionId: "session-1",
      projectId: "project-1",
      idempotencyKey,
      input: {
        message: "Write a short note",
        executionMode: "ai-sdk" as const,
        model: "gpt-4o-mini",
      },
    };
  }

  it("submits idempotently, persists stream events, and replays/subscribes", async () => {
    let executorInput: AgentExecutionInput | undefined;
    const coordinator = await setup(() =>
      createExecutor(async function* (input) {
        executorInput = input;
        yield { type: "text_delta", text: "Hello" };
        yield { type: "done", reason: "completed" };
      }),
    );
    const submitted = await coordinator.submit(request());
    const duplicate = await coordinator.submit(request());
    expect(duplicate.created).toBe(false);
    expect(duplicate.run.id).toBe(submitted.run.id);

    const received: string[] = [];
    const unsubscribe = coordinator.subscribe(submitted.run.id, (event) => {
      received.push(event.type);
    });
    const streamed: AgentSseEvent[] = [];
    const result = await coordinator.processNext({
      workerId: "worker-1",
      onEvent: (event) => {
        streamed.push(event);
      },
    });
    unsubscribe();

    expect(result).toMatchObject({
      runId: submitted.run.id,
      status: "completed",
      processed: true,
      eventCount: 2,
    });
    expect(streamed).toEqual([
      { type: "text_delta", text: "Hello" },
      { type: "done", reason: "completed" },
    ]);
    expect(executorInput).toMatchObject({
      projectId: "project-1",
      runId: submitted.run.id,
      projects: expect.any(Object),
    });
    const replay = await coordinator.replay(submitted.run.id);
    expect(replay.map((event) => event.type)).toContain("run.created");
    expect(replay.map((event) => event.type)).toContain("run.enqueued");
    expect(replay.filter((event) => event.type === "agent.event")).toHaveLength(2);
    expect(received).toContain("agent.event");
    expect(received).toContain("run.status_changed");
    expect(received).not.toContain("run.created");
    expect(received).not.toContain("run.enqueued");
  });

  it("streams a burst of text deltas without re-reading full run history per event", async () => {
    const store = createMemoryRunStore();
    let listEventsCalls = 0;
    const originalListEvents = store.listEvents.bind(store);
    store.listEvents = (...args: Parameters<RunStore["listEvents"]>) => {
      listEventsCalls += 1;
      return originalListEvents(...args);
    };
    const deltaCount = 50;
    const coordinator = await setup(
      () =>
        createExecutor(async function* () {
          for (let i = 0; i < deltaCount; i++) {
            yield { type: "text_delta", text: `chunk-${i}` };
          }
          yield { type: "done", reason: "completed" };
        }),
      undefined,
      store,
    );
    const submitted = await coordinator.submit(request());
    const streamed: AgentSseEvent[] = [];
    coordinator.subscribe(submitted.run.id, () => {});
    listEventsCalls = 0; // ignore submit-time bookkeeping reads
    await coordinator.processNext({
      workerId: "worker-1",
      onEvent: (event) => {
        streamed.push(event);
      },
    });

    expect(streamed).toHaveLength(deltaCount + 1);
    // Each appended event is pushed to subscribers directly; the store's
    // full listEvents history read must not be called once per token.
    expect(listEventsCalls).toBeLessThan(deltaCount);
  });

  it("completes Workflow production state before marking the durable Run completed", async () => {
    const root = mkdtempSync(join(tmpdir(), "winlume-coordinator-workflow-"));
    directories.push(root);
    const host = createWebFileStore(root);
    await host.sessions.createSession({
      id: "session-1",
      userId: "user-1",
      title: "Workflow",
      model: "gpt-4o-mini",
    });
    const runs = createMemoryRunStore();
    const pack = await getProductionPack("content-office");
    expect(pack).not.toBeNull();
    const binding = createWorkflowSessionBinding(
      pack!,
      {
        topic: "夏季新品",
        audience: "品牌团队",
        "delivery-format": "article",
      },
      { workflowId: "workflow-1" },
    );
    const first = prepareFirstProductionStage(pack!, binding);
    const workflow = new ProductionWorkflowExecution({
      runs,
      sessions: host.sessions,
      artifacts: host.artifacts,
      getPack: getProductionPack,
    });
    const coordinator = new RunCoordinator({
      store: runs,
      queue: createInProcessRunQueue(),
      sessions: host.sessions,
      projects: host.projects,
      artifacts: host.artifacts,
      policy: createStaticRunPolicy({
        allowedExecutionModes: ["ai-sdk"],
        allowedModels: ["gpt-4o-mini"],
      }),
      productionWorkflow: workflow,
      executorFactory: () =>
        createExecutor(async function* (input) {
          expect(input.workflow).toMatchObject({
            workflowId: "workflow-1",
            stageId: "intake",
            outputs: [{ id: "brief", kinds: ["markdown"] }],
          });
          await input.artifacts.write(
            {
              id: "artifact-brief",
              userId: input.userId,
              sessionId: input.sessionId,
              name: "工作简报",
              kind: "markdown",
              mimeType: "text/markdown; charset=utf-8",
              storageKey: "",
              createdAt: "2026-08-04T08:00:00.000Z",
              provenance: {
                workflow: {
                  workflowId: input.workflow!.workflowId,
                  runId: input.workflow!.runId,
                  stageId: input.workflow!.stageId,
                  outputId: "brief",
                },
              },
            },
            "# 工作简报",
          );
          yield { type: "done", reason: "completed" };
        }),
    });
    const submitted = await coordinator.submit({
      id: "run-1",
      userId: "user-1",
      sessionId: "session-1",
      idempotencyKey: first.effect.idempotencyKey,
      idempotencyScope: `user:user-1:${first.effect.idempotencyScope}`,
      input: {
        message: "生成工作简报",
        executionMode: "ai-sdk",
        model: "gpt-4o-mini",
        skillIds: first.effect.skillIds,
        skillSelectionMode: "replace",
        allowedToolNames: first.state.execution.allowedTools,
      },
      metadata: { production: serializeProductionRunMetadata(first.state) },
    });

    const result = await coordinator.processNext({ workerId: "worker-1" });
    const completed = await coordinator.getRun(submitted.run.id);

    expect(result).toMatchObject({ status: "completed" });
    expect(completed?.metadata?.production).toMatchObject({
      phase: "ready_for_next",
      completedStageIds: ["intake"],
      artifacts: { outputs: { brief: ["artifact-brief"] } },
    });
  });

  it("cancels a queued run before an executor is started", async () => {
    let calls = 0;
    const coordinator = await setup(() =>
      createExecutor(async function* () {
        calls += 1;
        yield { type: "done", reason: "completed" };
      }),
    );
    const submitted = await coordinator.submit(request());
    const cancelled = await coordinator.cancel(submitted.run.id, "user-1");
    const result = await coordinator.processNext({ workerId: "worker-1" });

    expect(cancelled.status).toBe("cancelled");
    expect(result).toMatchObject({ status: "cancelled", processed: false });
    expect(calls).toBe(0);
    expect((await coordinator.replay(submitted.run.id)).map((event) => event.type)).toContain(
      "run.cancel_requested",
    );
  });

  it("cancels an active run and retains its already-emitted events", async () => {
    const coordinator = await setup(() =>
      createExecutor(async function* () {
        yield { type: "text_delta", text: "started" };
        yield { type: "done", reason: "completed" };
      }),
    );
    const submitted = await coordinator.submit(request());
    const result = await coordinator.processNext({
      workerId: "worker-1",
      onEvent: async (event) => {
        if (event.type === "text_delta") {
          await coordinator.cancel(submitted.run.id, "user-1");
        }
      },
    });

    expect(result).toMatchObject({ status: "cancelled", processed: true, eventCount: 1 });
    const agentEvents = (await coordinator.replay(submitted.run.id)).filter(
      (event) => event.type === "agent.event",
    );
    expect(agentEvents).toHaveLength(1);
  });

  it("requeues retryable executor failures and completes on a later attempt", async () => {
    let attempts = 0;
    const coordinator = await setup(() =>
      createExecutor(
        async function* () {
          attempts += 1;
          if (attempts === 1) throw new Error("temporary upstream failure");
          yield { type: "done", reason: "completed" };
        },
        "safe",
      ),
    );
    const submitted = await coordinator.submit(request(), { maxAttempts: 2 });
    const first = await coordinator.processNext({ workerId: "worker-1" });
    const second = await coordinator.processNext({ workerId: "worker-1" });

    expect(first).toMatchObject({ retryScheduled: true, status: "running" });
    expect(second).toMatchObject({ retryScheduled: false, status: "completed" });
    expect(attempts).toBe(2);
    expect((await coordinator.replay(submitted.run.id)).map((event) => event.type)).toContain(
      "run.retry_scheduled",
    );
  });

  it("fails durably when the worker exceeds the configured tool-call budget", async () => {
    const coordinator = await setup(
      () =>
        createExecutor(async function* () {
          yield { type: "tool_call", id: "call-1", name: "read_artifact", input: {} };
          yield { type: "tool_call", id: "call-2", name: "read_artifact", input: {} };
        }),
      createStaticRunPolicy({
        allowedExecutionModes: ["ai-sdk"],
        allowedModels: ["gpt-4o-mini"],
        limits: { maxToolCalls: 1 },
      }),
    );
    const submitted = await coordinator.submit(request());

    const result = await coordinator.processNext({ workerId: "worker-1" });
    const events = await coordinator.replay(submitted.run.id);

    expect(result).toMatchObject({ status: "failed", retryScheduled: false });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "agent.event",
        payload: expect.objectContaining({
          event: expect.objectContaining({ code: "tool_budget_exceeded" }),
        }),
      }),
    );
  });

  it("blocks a tool that the policy denies before the executor advances", async () => {
    let advancedPastToolCall = false;
    const coordinator = await setup(
      () =>
        createExecutor(async function* () {
          yield { type: "tool_call", id: "call-1", name: "generate_image", input: {} };
          advancedPastToolCall = true;
          yield { type: "done", reason: "completed" };
        }),
      createStaticRunPolicy({
        allowedExecutionModes: ["ai-sdk"],
        allowedModels: ["gpt-4o-mini"],
        deniedTools: ["generate_image"],
      }),
    );
    const submitted = await coordinator.submit(request());

    const result = await coordinator.processNext({ workerId: "worker-1" });
    const events = await coordinator.replay(submitted.run.id);

    expect(result).toMatchObject({ status: "failed", retryScheduled: false });
    expect(advancedPastToolCall).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "agent.event",
        payload: expect.objectContaining({
          event: expect.objectContaining({ code: "tool_not_allowed" }),
        }),
      }),
    );
  });

  it("blocks a tool outside the Run-level allowlist", async () => {
    let advancedPastToolCall = false;
    const coordinator = await setup(() =>
      createExecutor(async function* () {
        yield { type: "tool_call", id: "call-1", name: "generate_image", input: {} };
        advancedPastToolCall = true;
        yield { type: "done", reason: "completed" };
      }),
    );
    const baseRequest = request();
    const submitted = await coordinator.submit({
      ...baseRequest,
      input: {
        ...baseRequest.input,
        allowedToolNames: ["write_artifact"],
      },
    });

    const result = await coordinator.processNext({ workerId: "worker-1" });

    expect(result?.status).toBe("failed");
    expect(advancedPastToolCall).toBe(false);
    expect((await coordinator.getRun(submitted.run.id))?.error).toMatchObject({
      code: "tool_not_allowed",
    });
  });

  it("does not replay an at-most-once executor after it has started", async () => {
    let attempts = 0;
    const coordinator = await setup(() =>
      createExecutor(async function* () {
        attempts += 1;
        throw new Error("gateway disconnected after work began");
      }),
    );
    const submitted = await coordinator.submit(request(), { maxAttempts: 2 });

    const result = await coordinator.processNext({ workerId: "worker-1" });

    expect(result).toMatchObject({ status: "failed", retryScheduled: false });
    expect(attempts).toBe(1);
    expect((await coordinator.getRun(submitted.run.id))?.error).toMatchObject({
      code: "executor_error",
    });
  });

  it("records a worker shutdown as failure rather than user cancellation", async () => {
    const coordinator = await setup(() =>
      createExecutor(async function* () {
        yield { type: "text_delta", text: "started" };
        yield { type: "done", reason: "cancelled" };
      }),
    );
    const submitted = await coordinator.submit(request());
    const worker = new AbortController();

    const result = await coordinator.processNext({
      workerId: "worker-1",
      signal: worker.signal,
      onEvent: (event) => {
        if (event.type === "text_delta") worker.abort();
      },
    });

    expect(result).toMatchObject({ status: "failed", retryScheduled: false });
    expect((await coordinator.getRun(submitted.run.id))?.error).toMatchObject({
      code: "worker_shutdown",
    });
  });

  it("rejects Codex policy restrictions before launching the SDK", async () => {
    let launches = 0;
    const coordinator = await setup(
      () =>
        createExecutor(async function* () {
          launches += 1;
          yield { type: "done", reason: "completed" };
        }),
      createStaticRunPolicy({
        allowedExecutionModes: ["codex"],
        deniedTools: ["codex_file_change"],
      }),
    );

    await expect(
      coordinator.submit({
        ...request(),
        input: {
          message: "Inspect the repository",
          executionMode: "codex",
        },
      }),
    ).rejects.toMatchObject({ code: "tool_not_allowed" });
    expect(launches).toBe(0);
  });

  it("rejects Codex approval requirements before launching the SDK", async () => {
    const coordinator = await setup(
      () => createExecutor(async function* () {
        yield { type: "done", reason: "completed" };
      }),
      createStaticRunPolicy({
        allowedExecutionModes: ["codex"],
        approvalRequiredTools: ["codex_command"],
      }),
    );

    await expect(
      coordinator.submit({
        ...request(),
        input: {
          message: "Inspect the repository",
          executionMode: "codex",
        },
      }),
    ).rejects.toMatchObject({ code: "tool_approval_required" });
  });
});
