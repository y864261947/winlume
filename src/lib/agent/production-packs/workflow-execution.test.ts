import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRunStore } from "@/lib/agent/infrastructure/run-store";
import type { RunStore } from "@/lib/agent/infrastructure/types";
import { createWebFileStore } from "@/lib/host/web/file-store";
import { parseProductionPack } from "./contracts";
import { prepareFirstProductionStage, serializeProductionRunMetadata } from "./run-metadata";
import { createWorkflowSessionBinding } from "./session-binding";
import { ProductionWorkflowExecution } from "./workflow-execution";

const pack = parseProductionPack(
  JSON.stringify({
    schemaVersion: 1,
    id: "test-workflow",
    version: "1.0.0",
    sceneIds: ["content-office"],
    title: "测试工作流",
    summary: "验证 Workflow Run 生命周期。",
    requiredCapabilities: ["chat"],
    intake: [
      {
        id: "topic",
        label: "主题",
        type: "text",
        required: true,
        description: "工作主题。",
      },
    ],
    expectedArtifacts: [
      { id: "brief", kinds: ["markdown"], required: true },
      { id: "draft", kinds: ["markdown"], required: true },
    ],
    stages: [
      {
        id: "intake",
        title: "需求澄清",
        objective: "形成工作简报。",
        handoffSummary: "向下一阶段提供工作简报。",
        skillIds: ["production-content-intake"],
        requiredInputs: [],
        outputs: [{ id: "brief", kinds: ["markdown"], required: true }],
        allowedTools: ["write_artifact"],
        qualityChecks: ["简报完整"],
        approvalPolicy: "required",
        maxAutomaticRevisions: 0,
      },
      {
        id: "draft",
        title: "内容成稿",
        objective: "根据工作简报形成完整文稿。",
        handoffSummary: "提供可交付的完整文稿。",
        skillIds: ["production-content-draft"],
        requiredInputs: [{ id: "brief", kinds: ["markdown"], required: true }],
        outputs: [{ id: "draft", kinds: ["markdown"], required: true }],
        allowedTools: ["read_artifact", "write_artifact"],
        qualityChecks: ["文稿满足简报要求"],
        approvalPolicy: "none",
        maxAutomaticRevisions: 1,
      },
    ],
  }),
);

describe("ProductionWorkflowExecution", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories) {
      rmSync(directory, { recursive: true, force: true });
    }
    directories.length = 0;
  });

  it("projects the first Stage as ready before any Run exists", async () => {
    const root = mkdtempSync(join(tmpdir(), "winlume-workflow-execution-"));
    directories.push(root);
    const host = createWebFileStore(root);
    const binding = createWorkflowSessionBinding(
      pack,
      { topic: "夏季新品" },
      { workflowId: "workflow-ready" },
    );
    await host.sessions.createSession({
      id: "session-ready",
      userId: "user-1",
      title: "Workflow",
      model: "gpt-4o-mini",
      workflow: binding,
    });
    const workflow = new ProductionWorkflowExecution({
      runs: createMemoryRunStore(),
      sessions: host.sessions,
      artifacts: host.artifacts,
      getPack: async () => null,
    });

    await expect(
      workflow.getProjection("user-1", "session-ready"),
    ).resolves.toMatchObject({
      currentStage: { id: "intake", index: 0, total: 2 },
      stages: [
        { id: "intake", status: "ready", outputs: [{ id: "brief" }] },
        { id: "draft", status: "upcoming" },
      ],
      outputs: {},
      actions: ["start"],
    });
  });

  it("atomically completes a Run after a concurrent infrastructure revision", async () => {
    const root = mkdtempSync(join(tmpdir(), "winlume-workflow-execution-"));
    directories.push(root);
    const host = createWebFileStore(root);
    const runs = createMemoryRunStore();
    const binding = createWorkflowSessionBinding(
      pack,
      { topic: "夏季新品" },
      { workflowId: "workflow-1" },
    );
    const first = prepareFirstProductionStage(pack, binding);
    const created = await runs.createRun({
      id: "run-1",
      userId: "user-1",
      sessionId: "session-1",
      input: {
        message: "生成工作简报",
        executionMode: "studio",
        model: "gpt-4o-mini",
      },
      metadata: { production: serializeProductionRunMetadata(first.state) },
    });
    await runs.transitionRun(created.run.id, "running");
    await host.artifacts.write(
      {
        id: "artifact-brief",
        userId: "user-1",
        sessionId: "session-1",
        name: "工作简报",
        kind: "markdown",
        mimeType: "text/markdown; charset=utf-8",
        storageKey: "",
        createdAt: "2026-08-04T08:00:00.000Z",
        provenance: {
          workflow: {
            workflowId: "workflow-1",
            runId: "run-1",
            stageId: "intake",
            outputId: "brief",
          },
        },
      },
      "# 工作简报",
    );

    let injectRevisionConflict = true;
    const workflowRuns = new Proxy(runs, {
      get(target, property, receiver) {
        if (property === "transitionRun") {
          return async (...args: Parameters<RunStore["transitionRun"]>) => {
            if (args[1] === "completed" && injectRevisionConflict) {
              injectRevisionConflict = false;
              await target.appendEvent({
                runId: args[0],
                type: "custom",
                payload: { heartbeat: true },
                producer: "test-heartbeat",
              });
            }
            return target.transitionRun(...args);
          };
        }
        const value = Reflect.get(target, property, receiver) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as RunStore;
    const workflow = new ProductionWorkflowExecution({
      runs: workflowRuns,
      sessions: host.sessions,
      artifacts: host.artifacts,
      getPack: async (id) => (id === pack.id ? pack : null),
    });
    const active = await runs.getRun("run-1");
    expect(active).not.toBeNull();
    await expect(workflow.executionContext(active!)).resolves.toMatchObject({
      workflowId: "workflow-1",
      runId: "run-1",
      stageId: "intake",
      presentation: {
        kind: "workflow_run",
        workflowId: "workflow-1",
        runId: "run-1",
        stageId: "intake",
        stageTitle: "需求澄清",
        iteration: 0,
        intent: "stage_start",
      },
    });
    const completed = await workflow.completeRun("run-1");

    expect(completed.status).toBe("completed");
    expect(completed.metadata?.production).toMatchObject({
      phase: "awaiting_approval",
      artifacts: { outputs: { brief: ["artifact-brief"] } },
      review: { status: "pending" },
    });
  });

  it("fails the Run instead of completing a Stage with a missing required output", async () => {
    const root = mkdtempSync(join(tmpdir(), "winlume-workflow-execution-"));
    directories.push(root);
    const host = createWebFileStore(root);
    const runs = createMemoryRunStore();
    const binding = createWorkflowSessionBinding(
      pack,
      { topic: "夏季新品" },
      { workflowId: "workflow-2" },
    );
    const first = prepareFirstProductionStage(pack, binding);
    const created = await runs.createRun({
      id: "run-missing-output",
      userId: "user-1",
      sessionId: "session-1",
      input: { message: "生成工作简报", executionMode: "studio" },
      metadata: { production: serializeProductionRunMetadata(first.state) },
    });
    await runs.transitionRun(created.run.id, "running");
    const workflow = new ProductionWorkflowExecution({
      runs,
      sessions: host.sessions,
      artifacts: host.artifacts,
      getPack: async (id) => (id === pack.id ? pack : null),
    });

    const failed = await workflow.completeRun(created.run.id);

    expect(failed.status).toBe("failed");
    expect(failed.error).toMatchObject({
      code: "workflow_output_missing",
      retryable: false,
    });
    expect(failed.metadata?.production).toMatchObject({ phase: "failed" });
  });

  it("projects stop for active heads and retry_stage for failed heads", async () => {
    const root = mkdtempSync(join(tmpdir(), "winlume-workflow-execution-"));
    directories.push(root);
    const host = createWebFileStore(root);
    const runs = createMemoryRunStore();
    const binding = createWorkflowSessionBinding(
      pack,
      { topic: "夏季新品" },
      { workflowId: "workflow-actions" },
    );
    await host.sessions.createSession({
      id: "session-actions",
      userId: "user-1",
      title: "Workflow",
      model: "gpt-4o-mini",
      workflow: binding,
    });
    const first = prepareFirstProductionStage(pack, binding);
    const created = await runs.createRun({
      id: "run-actions",
      userId: "user-1",
      sessionId: "session-actions",
      input: { message: "生成工作简报", executionMode: "studio" },
      metadata: { production: serializeProductionRunMetadata(first.state) },
    });
    const workflow = new ProductionWorkflowExecution({
      runs,
      sessions: host.sessions,
      artifacts: host.artifacts,
      getPack: async () => null,
    });

    await expect(
      workflow.getProjection("user-1", "session-actions"),
    ).resolves.toMatchObject({
      stages: [
        {
          id: "intake",
          status: "queued",
          outputs: [{ id: "brief", artifacts: [] }],
        },
        { id: "draft", status: "upcoming" },
      ],
      actions: ["stop"],
    });

    await runs.transitionRun(created.run.id, "running");
    await expect(
      workflow.getProjection("user-1", "session-actions"),
    ).resolves.toMatchObject({ actions: ["stop"] });

    const running = await runs.getRun(created.run.id);
    await runs.transitionRun(created.run.id, "failed", {
      reason: "worker interrupted",
      error: {
        code: "worker_interrupted",
        message: "Worker process stopped before the run completed",
        retryable: false,
      },
      metadata: {
        ...(running?.metadata ?? {}),
        production: serializeProductionRunMetadata({
          ...first.state,
          phase: "failed",
        }),
      },
      expectedRevision: running?.revision,
    });

    await expect(
      workflow.getProjection("user-1", "session-actions"),
    ).resolves.toMatchObject({
      run: {
        id: "run-actions",
        status: "failed",
        phase: "failed",
        error: {
          code: "worker_interrupted",
          message: "Worker process stopped before the run completed",
        },
      },
      actions: ["retry_stage"],
    });

    const cancelledBinding = createWorkflowSessionBinding(
      pack,
      { topic: "秋季新品" },
      { workflowId: "workflow-cancelled" },
    );
    await host.sessions.createSession({
      id: "session-cancelled",
      userId: "user-1",
      title: "Workflow",
      model: "gpt-4o-mini",
      workflow: cancelledBinding,
    });
    const cancelledFirst = prepareFirstProductionStage(pack, cancelledBinding);
    const cancelled = await runs.createRun({
      id: "run-cancelled",
      userId: "user-1",
      sessionId: "session-cancelled",
      input: { message: "生成工作简报", executionMode: "studio" },
      metadata: {
        production: serializeProductionRunMetadata(cancelledFirst.state),
      },
    });
    await runs.transitionRun(cancelled.run.id, "running");
    await runs.transitionRun(cancelled.run.id, "cancelled", {
      reason: "cancelled by user",
    });

    await expect(
      workflow.getProjection("user-1", "session-cancelled"),
    ).resolves.toMatchObject({
      run: { id: "run-cancelled", status: "cancelled" },
      actions: ["retry_stage"],
    });
  });

  it("creates one idempotent retry successor for a failed current head", async () => {
    const root = mkdtempSync(join(tmpdir(), "winlume-workflow-execution-"));
    directories.push(root);
    const host = createWebFileStore(root);
    const runs = createMemoryRunStore();
    const binding = createWorkflowSessionBinding(
      pack,
      { topic: "夏季新品" },
      { workflowId: "workflow-retry" },
    );
    await host.sessions.createSession({
      id: "session-retry",
      userId: "user-1",
      title: "Workflow",
      model: "gpt-4o-mini",
      workflow: binding,
    });
    const first = prepareFirstProductionStage(pack, binding);
    const failedState = {
      ...first.state,
      artifacts: {
        inputs: { source: ["artifact-approved-input"] },
        outputs: { brief: ["artifact-partial-output"] },
      },
      phase: "failed" as const,
    };
    const created = await runs.createRun({
      id: "run-failed",
      userId: "user-1",
      sessionId: "session-retry",
      input: {
        message: "生成工作简报",
        executionMode: "studio",
        model: "old-model",
      },
      metadata: { production: serializeProductionRunMetadata(failedState) },
    });
    await runs.transitionRun(created.run.id, "running");
    await runs.transitionRun(created.run.id, "failed", {
      reason: "executor failed",
      error: { code: "executor_failed", message: "executor failed", retryable: false },
    });
    const workflow = new ProductionWorkflowExecution({
      runs,
      sessions: host.sessions,
      artifacts: host.artifacts,
      getPack: async () => null,
      resolveStageExecution: async () => ({
        model: "server-selected-model",
        allowedTools: ["write_artifact"],
      }),
      submitRun: (input) => runs.createRun(input),
    });
    const command = {
      action: "retry_stage" as const,
      userId: "user-1",
      sessionId: "session-retry",
      runId: "run-failed",
      idempotencyKey: "retry-click-1",
      occurredAt: "2026-08-04T10:00:00.000Z",
    };

    const [retry, duplicate] = await Promise.all([
      workflow.executeCommand(command),
      workflow.executeCommand(command),
    ]);

    expect(retry.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.startedRun?.id).toBe(retry.startedRun?.id);
    const sequentialReplay = await workflow.executeCommand(command);
    expect(sequentialReplay.created).toBe(false);
    expect(sequentialReplay.startedRun?.id).toBe(retry.startedRun?.id);
    expect(retry.sourceRun).toMatchObject({
      id: "run-failed",
      status: "failed",
    });
    expect(retry.startedRun).toMatchObject({
      idempotencyScope: "user:user-1:workflow:workflow-retry",
      idempotencyKey: "stage:intake:iteration:1",
      input: {
        model: "server-selected-model",
        skillIds: ["production-content-intake"],
        allowedToolNames: ["write_artifact"],
        referencedArtifactIds: ["artifact-approved-input"],
      },
      metadata: {
        production: {
          phase: "executing",
          execution: {
            stageId: "intake",
            iteration: 1,
            predecessorRunId: "run-failed",
          },
          artifacts: {
            inputs: { source: ["artifact-approved-input"] },
            outputs: {},
          },
        },
      },
    });
  });

  it("creates one idempotent revision Run for repeated request_changes commands", async () => {
    const root = mkdtempSync(join(tmpdir(), "winlume-workflow-execution-"));
    directories.push(root);
    const host = createWebFileStore(root);
    const runs = createMemoryRunStore();
    const binding = createWorkflowSessionBinding(
      pack,
      { topic: "夏季新品" },
      { workflowId: "workflow-revision" },
    );
    await host.sessions.createSession({
      id: "session-1",
      userId: "user-1",
      title: "Workflow",
      model: "gpt-4o-mini",
      workflow: binding,
    });
    const first = prepareFirstProductionStage(pack, binding);
    const created = await runs.createRun({
      id: "run-revision-source",
      userId: "user-1",
      sessionId: "session-1",
      input: {
        message: "生成工作简报",
        executionMode: "studio",
        model: "gpt-4o-mini",
        skillIds: first.effect.skillIds,
        skillSelectionMode: "replace",
        allowedToolNames: first.state.execution.allowedTools,
      },
      metadata: { production: serializeProductionRunMetadata(first.state) },
    });
    await runs.transitionRun(created.run.id, "running");
    await host.artifacts.write(
      {
        id: "artifact-brief-v1",
        userId: "user-1",
        sessionId: "session-1",
        name: "工作简报 v1",
        kind: "markdown",
        mimeType: "text/markdown; charset=utf-8",
        storageKey: "",
        createdAt: "2026-08-04T08:00:00.000Z",
        provenance: {
          workflow: {
            workflowId: "workflow-revision",
            runId: "run-revision-source",
            stageId: "intake",
            outputId: "brief",
          },
        },
      },
      "# 工作简报 v1",
    );
    let failRevisionSubmission = true;
    const workflow = new ProductionWorkflowExecution({
      runs,
      sessions: host.sessions,
      artifacts: host.artifacts,
      getPack: async (id) => (id === pack.id ? pack : null),
      submitRun: async (input) => {
        if (failRevisionSubmission) {
          failRevisionSubmission = false;
          throw new Error("simulated submission interruption");
        }
        return runs.createRun(input);
      },
    });
    await workflow.completeRun(created.run.id);
    const command = {
      action: "request_changes" as const,
      userId: "user-1",
      sessionId: "session-1",
      runId: created.run.id,
      idempotencyKey: "decision-revision-1",
      occurredAt: "2026-08-04T09:00:00.000Z",
      note: "补充验收标准",
    };

    await expect(workflow.executeCommand(command)).rejects.toThrow(
      "simulated submission interruption",
    );
    await expect(
      workflow.getProjection("user-1", "session-1"),
    ).resolves.toMatchObject({
      review: { status: "changes_requested", note: "补充验收标准" },
      actions: ["request_changes"],
    });

    const retryCommand = {
      ...command,
      idempotencyKey: "decision-revision-retry",
      occurredAt: "2026-08-04T09:01:00.000Z",
    };
    const [firstResult, duplicate] = await Promise.all([
      workflow.executeCommand(retryCommand),
      workflow.executeCommand(retryCommand),
    ]);

    expect(firstResult.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.startedRun?.id).toBe(firstResult.startedRun?.id);
    expect(firstResult.sourceRun.metadata?.production).toMatchObject({
      phase: "needs_revision",
      decisions: [{ id: "decision-revision-1", type: "changes_requested" }],
    });
    expect(firstResult.startedRun?.metadata?.production).toMatchObject({
      phase: "executing",
      execution: {
        stageId: "intake",
        iteration: 1,
        predecessorRunId: "run-revision-source",
      },
    });
    expect(firstResult.startedRun).toMatchObject({
      idempotencyScope: "user:user-1:workflow:workflow-revision",
      idempotencyKey: "stage:intake:iteration:1",
      input: { referencedArtifactIds: ["artifact-brief-v1"] },
    });
  });

  it("approves the current Run and creates one idempotent next Stage Run", async () => {
    const root = mkdtempSync(join(tmpdir(), "winlume-workflow-execution-"));
    directories.push(root);
    const host = createWebFileStore(root);
    const runs = createMemoryRunStore();
    const binding = createWorkflowSessionBinding(
      pack,
      { topic: "夏季新品" },
      { workflowId: "workflow-next" },
    );
    await host.sessions.createSession({
      id: "session-1",
      userId: "user-1",
      title: "Workflow",
      model: "gpt-4o-mini",
      workflow: binding,
    });
    const first = prepareFirstProductionStage(pack, binding);
    const created = await runs.createRun({
      id: "run-next-source",
      userId: "user-1",
      sessionId: "session-1",
      input: {
        message: "生成工作简报",
        executionMode: "studio",
        model: "gpt-4o-mini",
        skillIds: first.effect.skillIds,
        skillSelectionMode: "replace",
        allowedToolNames: first.state.execution.allowedTools,
      },
      metadata: { production: serializeProductionRunMetadata(first.state) },
    });
    await runs.transitionRun(created.run.id, "running");
    await host.artifacts.write(
      {
        id: "artifact-brief-next",
        userId: "user-1",
        sessionId: "session-1",
        name: "工作简报",
        kind: "markdown",
        mimeType: "text/markdown; charset=utf-8",
        storageKey: "",
        createdAt: "2026-08-04T08:00:00.000Z",
        provenance: {
          workflow: {
            workflowId: "workflow-next",
            runId: "run-next-source",
            stageId: "intake",
            outputId: "brief",
          },
        },
      },
      "# 工作简报",
    );
    const workflow = new ProductionWorkflowExecution({
      runs,
      sessions: host.sessions,
      artifacts: host.artifacts,
      getPack: async () => null,
      submitRun: (input) => runs.createRun(input),
    });
    await workflow.completeRun(created.run.id);

    const approvalCommand = {
      action: "approve",
      userId: "user-1",
      sessionId: "session-1",
      runId: created.run.id,
      idempotencyKey: "decision-approve-1",
      occurredAt: "2026-08-04T09:00:00.000Z",
      note: "可以继续",
    } as const;
    const [approved, duplicateApproval] = await Promise.all([
      workflow.executeCommand(approvalCommand),
      workflow.executeCommand(approvalCommand),
    ]);
    const nextCommand = {
      action: "start_next" as const,
      userId: "user-1",
      sessionId: "session-1",
      runId: created.run.id,
      idempotencyKey: "command-next-1",
      occurredAt: "2026-08-04T09:01:00.000Z",
    };
    await expect(
      workflow.executeCommand({
        ...nextCommand,
        idempotencyKey: approvalCommand.idempotencyKey,
      }),
    ).rejects.toThrow("Decision id already belongs to a different action");
    const [next, duplicate] = await Promise.all([
      workflow.executeCommand(nextCommand),
      workflow.executeCommand(nextCommand),
    ]);

    expect(approved).toMatchObject({
      created: false,
      sourceRun: { metadata: { production: { phase: "ready_for_next" } } },
    });
    expect(duplicateApproval).toMatchObject({
      created: false,
      sourceRun: { metadata: { production: { phase: "ready_for_next" } } },
    });
    expect(approved.startedRun).toBeUndefined();
    expect(next.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.startedRun?.id).toBe(next.startedRun?.id);
    expect(next.sourceRun.metadata?.production).toMatchObject({
      decisions: [
        { id: "decision-approve-1", type: "approved" },
        { id: "command-next-1", type: "iteration_started" },
      ],
    });
    expect(next.startedRun).toMatchObject({
      idempotencyScope: "user:user-1:workflow:workflow-next",
      idempotencyKey: "stage:draft:iteration:0",
      input: {
        skillIds: ["production-content-draft"],
        allowedToolNames: ["read_artifact", "write_artifact"],
        referencedArtifactIds: ["artifact-brief-next"],
      },
      metadata: {
        production: {
          phase: "executing",
          execution: {
            stageId: "draft",
            stageIndex: 1,
            predecessorRunId: "run-next-source",
          },
          artifacts: { inputs: { brief: ["artifact-brief-next"] } },
        },
      },
    });

    const projection = await workflow.getProjection("user-1", "session-1");
    expect(projection).toMatchObject({
      workflowId: "workflow-next",
      pack: { id: "test-workflow", version: "1.0.0", title: "测试工作流" },
      currentStage: { id: "draft", index: 1, total: 2 },
      run: {
        id: next.startedRun?.id,
        status: "queued",
        iteration: 0,
        predecessorRunId: "run-next-source",
      },
      outputs: {
        brief: [
          {
            id: "artifact-brief-next",
            name: "工作简报",
            kind: "markdown",
          },
        ],
      },
      stages: [
        {
          id: "intake",
          title: "需求澄清",
          status: "completed",
          outputs: [
            {
              id: "brief",
              artifacts: [
                {
                  id: "artifact-brief-next",
                  name: "工作简报",
                  kind: "markdown",
                },
              ],
            },
          ],
        },
        {
          id: "draft",
          title: "内容成稿",
          status: "queued",
          outputs: [{ id: "draft", artifacts: [] }],
        },
      ],
      actions: ["stop"],
    });
    expect(projection).not.toHaveProperty("metadata");
    expect(projection.run).not.toHaveProperty("input");

    const workflowWithMissingArtifact = new ProductionWorkflowExecution({
      runs,
      sessions: host.sessions,
      artifacts: {
        ...host.artifacts,
        get: async () => null,
      },
      getPack: async (id) => (id === pack.id ? pack : null),
    });
    await expect(
      workflowWithMissingArtifact.getProjection("user-1", "session-1"),
    ).rejects.toThrow("Workflow output Artifact is unavailable");
  });
});
