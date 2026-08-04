import { describe, expect, it } from "vitest";
import { parseProductionPack } from "./contracts";
import { createWorkflowSessionBinding } from "./session-binding";
import {
  approveProductionStage,
  parseProductionRunMetadata,
  prepareFirstProductionStage,
  prepareNextProductionStage,
  prepareProductionRetry,
  prepareProductionRevision,
  recordProductionStageResult,
  requestProductionChanges,
  serializeProductionRunMetadata,
} from "./run-metadata";

const pack = parseProductionPack(
  JSON.stringify({
    schemaVersion: 1,
    id: "content-office",
    version: "1.1.0",
    sceneIds: ["content-office"],
    title: "内容与办公工作流",
    summary: "从需求澄清到经过审阅的工作文档。",
    requiredCapabilities: ["chat"],
    intake: [
      {
        id: "topic",
        label: "主题",
        type: "text",
        required: true,
        description: "需要完成的内容主题。",
      },
      {
        id: "source-artifact",
        label: "参考材料",
        type: "artifact",
        required: false,
        description: "已有材料。",
        kinds: ["markdown"],
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
        objective: "将任务转成可执行 brief。",
        handoffSummary: "向下一阶段提供工作简报。",
        skillIds: ["production-content-intake"],
        requiredInputs: [],
        outputs: [{ id: "brief", kinds: ["markdown"], required: true }],
        allowedTools: ["write_artifact"],
        qualityChecks: ["brief includes audience and outcome"],
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

describe("Production Run metadata", () => {
  it("prepares a deterministic first Stage execution and round-trips persisted JSON", () => {
    const binding = createWorkflowSessionBinding(
      pack,
      { topic: "夏季新品", "source-artifact": "artifact-1" },
      {
        workflowId: "workflow-1",
        now: new Date("2026-08-04T06:00:00.000Z"),
      },
    );

    const transition = prepareFirstProductionStage(pack, binding);

    expect(transition.effect).toEqual({
      type: "start_stage",
      idempotencyScope: "workflow:workflow-1",
      idempotencyKey: "stage:intake:iteration:0",
      stageId: "intake",
      skillIds: ["production-content-intake"],
      referencedArtifactIds: ["artifact-1"],
    });
    expect(transition.state).toMatchObject({
      schemaVersion: 1,
      workflowId: "workflow-1",
      pack: { id: "content-office", version: "1.1.0" },
      completedStageIds: [],
      execution: {
        stageId: "intake",
        stageIndex: 0,
        iteration: 0,
        skillIds: ["production-content-intake"],
        allowedTools: ["write_artifact"],
      },
      artifacts: {
        inputs: { "source-artifact": ["artifact-1"] },
        outputs: {},
      },
      phase: "executing",
      decisions: [],
    });
    expect(
      parseProductionRunMetadata(serializeProductionRunMetadata(transition.state)),
    ).toEqual(transition.state);
  });

  it("moves approved Stage output into a new Run effect for the next Stage", () => {
    const binding = createWorkflowSessionBinding(
      pack,
      { topic: "夏季新品" },
      { workflowId: "workflow-1" },
    );
    const first = prepareFirstProductionStage(pack, binding);

    expect(() => recordProductionStageResult(pack, first.state, {})).toThrow(
      "brief",
    );
    const reviewed = recordProductionStageResult(pack, first.state, {
      brief: ["artifact-brief"],
    });
    expect(reviewed).toMatchObject({
      effect: { type: "none" },
      state: {
        phase: "awaiting_approval",
        completedStageIds: [],
        artifacts: { outputs: { brief: ["artifact-brief"] } },
        review: { status: "pending" },
      },
    });

    const approved = approveProductionStage(pack, reviewed.state, {
      decisionId: "decision-1",
      actorId: "user-1",
      occurredAt: "2026-08-04T07:00:00.000Z",
      note: "可以继续",
    });
    expect(approved.state).toMatchObject({
      phase: "ready_for_next",
      completedStageIds: ["intake"],
      review: { status: "approved", decidedBy: "user-1" },
    });
    expect(
      approveProductionStage(pack, approved.state, {
        decisionId: "decision-1",
        actorId: "user-1",
        occurredAt: "2026-08-04T07:00:00.000Z",
        note: "可以继续",
      }),
    ).toEqual(approved);

    const next = prepareNextProductionStage(pack, approved.state, {
      predecessorRunId: "run-1",
    });
    expect(next.effect).toEqual({
      type: "start_stage",
      idempotencyScope: "workflow:workflow-1",
      idempotencyKey: "stage:draft:iteration:0",
      stageId: "draft",
      skillIds: ["production-content-draft"],
      referencedArtifactIds: ["artifact-brief"],
    });
    expect(next.state).toMatchObject({
      phase: "executing",
      execution: {
        stageId: "draft",
        stageIndex: 1,
        iteration: 0,
        predecessorRunId: "run-1",
      },
      artifacts: { inputs: { brief: ["artifact-brief"] } },
    });
  });

  it("prepares a retry successor without inheriting partial Stage outputs", () => {
    const binding = createWorkflowSessionBinding(
      pack,
      { topic: "夏季新品" },
      { workflowId: "workflow-retry" },
    );
    const first = prepareFirstProductionStage(pack, binding);
    const failed = parseProductionRunMetadata({
      ...first.state,
      execution: {
        ...first.state.execution,
        iteration: 2,
      },
      artifacts: {
        inputs: { "source-artifact": ["artifact-approved-input"] },
        outputs: { brief: ["artifact-partial-output"] },
      },
      phase: "failed",
    });

    const retry = prepareProductionRetry(pack, failed, {
      predecessorRunId: "run-failed",
    });

    expect(retry.state).toMatchObject({
      phase: "executing",
      execution: {
        stageId: "intake",
        iteration: 3,
        predecessorRunId: "run-failed",
      },
      artifacts: {
        inputs: { "source-artifact": ["artifact-approved-input"] },
        outputs: {},
      },
    });
    expect(retry.effect).toEqual({
      type: "start_stage",
      idempotencyScope: "workflow:workflow-retry",
      idempotencyKey: "stage:intake:iteration:3",
      stageId: "intake",
      skillIds: ["production-content-intake"],
      referencedArtifactIds: ["artifact-approved-input"],
    });
  });

  it("records requested changes and prepares one deterministic revision Run", () => {
    const binding = createWorkflowSessionBinding(
      pack,
      { topic: "夏季新品" },
      { workflowId: "workflow-revision" },
    );
    const first = prepareFirstProductionStage(pack, binding);
    const reviewed = recordProductionStageResult(pack, first.state, {
      brief: ["artifact-brief-v1"],
    });
    const requested = requestProductionChanges(pack, reviewed.state, {
      decisionId: "decision-revise-1",
      actorId: "user-1",
      occurredAt: "2026-08-04T08:00:00.000Z",
      note: "补充验收标准",
    });

    expect(requested.state).toMatchObject({
      phase: "needs_revision",
      review: {
        status: "changes_requested",
        decidedBy: "user-1",
        note: "补充验收标准",
      },
      decisions: [{ id: "decision-revise-1", type: "changes_requested" }],
    });
    expect(
      requestProductionChanges(pack, requested.state, {
        decisionId: "decision-revise-1",
        actorId: "user-1",
        occurredAt: "2026-08-04T08:05:00.000Z",
        note: "补充验收标准",
      }),
    ).toEqual(requested);

    const revision = prepareProductionRevision(pack, requested.state, {
      predecessorRunId: "run-1",
    });
    expect(revision.effect).toEqual({
      type: "start_stage",
      idempotencyScope: "workflow:workflow-revision",
      idempotencyKey: "stage:intake:iteration:1",
      stageId: "intake",
      skillIds: ["production-content-intake"],
      referencedArtifactIds: ["artifact-brief-v1"],
    });
    expect(revision.state).toMatchObject({
      phase: "executing",
      execution: {
        stageId: "intake",
        iteration: 1,
        predecessorRunId: "run-1",
      },
      artifacts: { outputs: { brief: ["artifact-brief-v1"] } },
      review: undefined,
    });
  });

  it("requires an explicit decision for on-blocking-review until reviews are structured", () => {
    const blockingReviewPack = parseProductionPack(
      JSON.stringify({
        ...pack,
        stages: pack.stages.map((stage) =>
          stage.id === "draft"
            ? { ...stage, approvalPolicy: "on-blocking-review" }
            : stage,
        ),
      }),
    );
    const binding = createWorkflowSessionBinding(
      blockingReviewPack,
      { topic: "夏季新品" },
      { workflowId: "workflow-blocking-review" },
    );
    const first = prepareFirstProductionStage(blockingReviewPack, binding);
    const reviewed = recordProductionStageResult(blockingReviewPack, first.state, {
      brief: ["artifact-brief"],
    });
    const approved = approveProductionStage(blockingReviewPack, reviewed.state, {
      decisionId: "approve-brief",
      actorId: "user-1",
      occurredAt: "2026-08-04T08:00:00.000Z",
    });
    const draft = prepareNextProductionStage(blockingReviewPack, approved.state, {
      predecessorRunId: "run-brief",
    });

    const result = recordProductionStageResult(blockingReviewPack, draft.state, {
      draft: ["artifact-draft"],
    });

    expect(result).toMatchObject({
      effect: { type: "none" },
      state: {
        phase: "awaiting_approval",
        completedStageIds: ["intake"],
        review: { status: "pending" },
      },
    });
  });
});
