import type { ArtifactKind } from "@/lib/agent/types";
import type { ProductionPackMeta } from "./contracts";

export type ProductionWorkflowAction =
  | "start"
  | "stop"
  | "approve"
  | "request_changes"
  | "start_next"
  | "retry_stage";

export type ProductionWorkflowCommand =
  | { action: "approve"; runId: string; note?: string }
  | { action: "request_changes"; runId: string; note: string }
  | { action: "start_next"; runId: string }
  | { action: "retry_stage"; runId: string };

export type ProductionWorkflowPhase =
  | "executing"
  | "awaiting_approval"
  | "ready_for_next"
  | "needs_revision"
  | "workflow_completed"
  | "failed";

export type ProductionWorkflowStageStatus =
  | "ready"
  | "queued"
  | "running"
  | "awaiting_approval"
  | "ready_for_next"
  | "needs_revision"
  | "completed"
  | "failed"
  | "cancelled"
  | "upcoming";

export type ProductionWorkflowArtifactRef = {
  id: string;
  name: string;
  kind: ArtifactKind;
  status?: "pending" | "ready" | "failed";
};

export interface ProductionWorkflowProjection {
  workflowId: string;
  pack: ProductionPackMeta;
  currentStage: {
    id: string;
    title: string;
    index: number;
    total: number;
  };
  stages: Array<{
    id: string;
    title: string;
    index: number;
    summary?: string;
    status: ProductionWorkflowStageStatus;
    outputs: Array<{
      id: string;
      required: boolean;
      kinds: ArtifactKind[];
      artifacts: ProductionWorkflowArtifactRef[];
    }>;
  }>;
  run?: {
    id: string;
    status:
      | "queued"
      | "running"
      | "waiting_approval"
      | "completed"
      | "failed"
      | "cancelled";
    phase: ProductionWorkflowPhase;
    iteration: number;
    predecessorRunId?: string;
    error?: { code: string; message: string };
  };
  outputs: Record<
    string,
    ProductionWorkflowArtifactRef[]
  >;
  review?: {
    status: "pending" | "approved" | "changes_requested";
    decidedBy?: string;
    decidedAt?: string;
    note?: string;
  };
  actions: ProductionWorkflowAction[];
}
