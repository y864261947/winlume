import type {
  ProductionWorkflowAction,
  ProductionWorkflowProjection,
} from "@/lib/agent/production-packs/workflow-contract";

export type WorkflowViewAction =
  | ProductionWorkflowAction
  | "open_output"
  | "refresh";

export type WorkflowViewState = {
  kind:
    | "ready"
    | "queued"
    | "running"
    | "approval"
    | "next"
    | "revision"
    | "completed"
    | "failed"
    | "cancelled"
    | "loading"
    | "blocked";
  label: string;
  primaryAction?: WorkflowViewAction;
  secondaryActions: WorkflowViewAction[];
};

export function toWorkflowViewState(
  projection: ProductionWorkflowProjection | null | undefined,
): WorkflowViewState {
  if (projection === undefined) {
    return {
      kind: "loading",
      label: "正在加载",
      primaryAction: undefined,
      secondaryActions: [],
    };
  }

  if (projection === null) {
    return {
      kind: "blocked",
      label: "状态暂不可用",
      primaryAction: "refresh",
      secondaryActions: [],
    };
  }

  if (projection.run?.status === "queued") {
    return {
      kind: "queued",
      label: "等待执行",
      primaryAction: projection.actions.includes("stop") ? "stop" : undefined,
      secondaryActions: [],
    };
  }

  if (projection.run?.status === "running") {
    return {
      kind: "running",
      label: "执行中",
      primaryAction: projection.actions.includes("stop") ? "stop" : undefined,
      secondaryActions: [],
    };
  }

  if (
    projection.run?.status === "failed" ||
    projection.run?.status === "cancelled"
  ) {
    const kind = projection.run.status;
    return {
      kind,
      label: kind === "failed" ? "执行失败" : "已停止",
      primaryAction: projection.actions.includes("retry_stage")
        ? "retry_stage"
        : undefined,
      secondaryActions: [],
    };
  }

  if (
    projection.run?.status === "waiting_approval" ||
    projection.run?.phase === "awaiting_approval"
  ) {
    return {
      kind: "approval",
      label: "等待审核",
      primaryAction: projection.actions.includes("approve")
        ? "approve"
        : undefined,
      secondaryActions: projection.actions.includes("request_changes")
        ? ["request_changes"]
        : [],
    };
  }

  if (projection.run?.phase === "ready_for_next") {
    return {
      kind: "next",
      label: "本阶段完成",
      primaryAction: projection.actions.includes("start_next")
        ? "start_next"
        : undefined,
      secondaryActions: [],
    };
  }

  if (projection.run?.phase === "needs_revision") {
    return {
      kind: "revision",
      label: "返工待恢复",
      primaryAction: projection.actions.includes("request_changes")
        ? "request_changes"
        : undefined,
      secondaryActions: [],
    };
  }

  if (projection.run?.phase === "workflow_completed") {
    const hasOutput = Object.values(projection.outputs).some(
      (artifacts) => artifacts.length > 0,
    );
    return {
      kind: "completed",
      label: "工作流完成",
      primaryAction: hasOutput ? "open_output" : undefined,
      secondaryActions: [],
    };
  }

  if (projection.run) {
    return {
      kind: "blocked",
      label: "状态暂不可用",
      primaryAction: "refresh",
      secondaryActions: [],
    };
  }

  return {
    kind: "ready",
    label: "尚未开始",
    primaryAction: projection.actions.includes("start") ? "start" : undefined,
    secondaryActions: [],
  };
}
