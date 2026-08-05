import { describe, expect, it } from "vitest";
import type { ProductionWorkflowProjection } from "@/lib/agent/production-packs/workflow-contract";
import { toWorkflowViewState } from "./workflow-state";

function projection(
  partial: Partial<ProductionWorkflowProjection> = {},
): ProductionWorkflowProjection {
  return {
    workflowId: "workflow-1",
    pack: {
      id: "content-office",
      version: "1.0.0",
      sceneIds: ["content"],
      title: "内容工作流",
      summary: "从需求到成稿",
      requiredCapabilities: [],
      intake: [],
      expectedArtifacts: [],
      stages: [],
    },
    currentStage: { id: "brief", title: "需求澄清", index: 0, total: 2 },
    stages: [],
    outputs: {},
    actions: ["start"],
    ...partial,
  };
}

describe("Workflow view state", () => {
  it("presents a bound Workflow without a Run as ready to start", () => {
    expect(toWorkflowViewState(projection())).toMatchObject({
      kind: "ready",
      label: "尚未开始",
      primaryAction: "start",
    });
  });

  it("only offers stop for a queued Run when the projection allows it", () => {
    const queued = projection({
      run: {
        id: "run-1",
        status: "queued",
        phase: "executing",
        iteration: 0,
      },
      actions: ["stop"],
    });

    expect(toWorkflowViewState(queued)).toMatchObject({
      kind: "queued",
      label: "等待执行",
      primaryAction: "stop",
    });
    expect(
      toWorkflowViewState({ ...queued, actions: [] }),
    ).toMatchObject({ kind: "queued", primaryAction: undefined });
  });

  it("presents an executing Run as running", () => {
    expect(
      toWorkflowViewState(
        projection({
          run: {
            id: "run-1",
            status: "running",
            phase: "executing",
            iteration: 0,
          },
          actions: ["stop"],
        }),
      ),
    ).toMatchObject({
      kind: "running",
      label: "执行中",
      primaryAction: "stop",
    });
  });

  it("exposes only projected review commands while awaiting approval", () => {
    const awaitingApproval = projection({
      run: {
        id: "run-1",
        status: "waiting_approval",
        phase: "awaiting_approval",
        iteration: 0,
      },
      actions: ["approve", "request_changes"],
    });

    expect(toWorkflowViewState(awaitingApproval)).toMatchObject({
      kind: "approval",
      label: "等待审核",
      primaryAction: "approve",
      secondaryActions: ["request_changes"],
    });
    expect(
      toWorkflowViewState({ ...awaitingApproval, actions: [] }),
    ).toMatchObject({
      kind: "approval",
      primaryAction: undefined,
      secondaryActions: [],
    });
  });

  it("requires an explicit projected command before starting the next Stage", () => {
    expect(
      toWorkflowViewState(
        projection({
          run: {
            id: "run-1",
            status: "completed",
            phase: "ready_for_next",
            iteration: 0,
          },
          actions: ["start_next"],
        }),
      ),
    ).toMatchObject({
      kind: "next",
      label: "本阶段完成",
      primaryAction: "start_next",
    });
    expect(
      toWorkflowViewState(
        projection({
          run: {
            id: "run-1",
            status: "completed",
            phase: "ready_for_next",
            iteration: 0,
          },
          actions: [],
        }),
      ),
    ).toMatchObject({ kind: "next", primaryAction: undefined });
  });

  it("maps the recoverable revision handoff to request_changes", () => {
    expect(
      toWorkflowViewState(
        projection({
          run: {
            id: "run-1",
            status: "completed",
            phase: "needs_revision",
            iteration: 0,
          },
          actions: ["request_changes"],
        }),
      ),
    ).toMatchObject({
      kind: "revision",
      label: "返工待恢复",
      primaryAction: "request_changes",
    });
    expect(
      toWorkflowViewState(
        projection({
          run: {
            id: "run-1",
            status: "completed",
            phase: "needs_revision",
            iteration: 0,
          },
          actions: [],
        }),
      ),
    ).toMatchObject({ kind: "revision", primaryAction: undefined });
  });

  it("offers final Artifact navigation only when a completed Workflow has output", () => {
    const completed = projection({
      run: {
        id: "run-1",
        status: "completed",
        phase: "workflow_completed",
        iteration: 0,
      },
      outputs: {
        final: [
          { id: "artifact-1", name: "最终成稿", kind: "markdown" },
        ],
      },
      actions: [],
    });

    expect(toWorkflowViewState(completed)).toMatchObject({
      kind: "completed",
      label: "工作流完成",
      primaryAction: "open_output",
    });
    expect(
      toWorkflowViewState({ ...completed, outputs: {} }),
    ).toMatchObject({ kind: "completed", primaryAction: undefined });
  });

  it.each([
    ["failed", "failed", "执行失败"],
    ["cancelled", "cancelled", "已停止"],
  ] as const)(
    "maps a %s Run to a projection-gated retry",
    (status, kind, label) => {
      const terminal = projection({
        run: {
          id: "run-1",
          status,
          phase: "failed",
          iteration: 0,
        },
        actions: ["retry_stage"],
      });

      expect(toWorkflowViewState(terminal)).toMatchObject({
        kind,
        label,
        primaryAction: "retry_stage",
      });
      expect(
        toWorkflowViewState({ ...terminal, actions: [] }),
      ).toMatchObject({ kind, primaryAction: undefined });
    },
  );

  it("distinguishes an unresolved projection from a failed projection", () => {
    expect(toWorkflowViewState(undefined)).toMatchObject({
      kind: "loading",
      label: "正在加载",
      primaryAction: undefined,
    });
    expect(toWorkflowViewState(null)).toMatchObject({
      kind: "blocked",
      label: "状态暂不可用",
      primaryAction: "refresh",
    });
  });

  it("fails closed when a persisted Run has an unsupported status and phase pair", () => {
    expect(
      toWorkflowViewState(
        projection({
          run: {
            id: "run-1",
            status: "completed",
            phase: "executing",
            iteration: 0,
          },
          actions: [],
        }),
      ),
    ).toMatchObject({
      kind: "blocked",
      label: "状态暂不可用",
      primaryAction: "refresh",
    });
  });
});
