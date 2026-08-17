import { randomUUID } from "node:crypto";
import {
  ECOMMERCE_IMAGE_SET_PIPELINE_VERSION,
  type EcommerceImageSetPlan,
  type EcommerceImageSetSize,
  type EcommerceImageSetTemplate,
} from "./ecommerce-image-set";

export type EcommerceImageSetJobStage =
  | "queued"
  | "cutting_out"
  | "planning"
  | "generating"
  | "review"
  | "failed";

export type EcommerceImageSetEvaluation = {
  status: "not_run" | "needs_review";
  reason: string;
  updatedAt: string;
};

export type EcommerceImageSetUsage = {
  capability: string;
  provider: "aliyun" | "new-api";
  status: "started" | "completed" | "failed";
  requestedOutputs?: number;
  recordedAt: string;
};

/** One persisted, user-owned execution of the e-commerce image-set tool. */
export type EcommerceImageSetJob = {
  id: string;
  userId: string;
  sessionId: string;
  projectId?: string;
  toolId: "ecommerce-image-set";
  pipelineVersion: typeof ECOMMERCE_IMAGE_SET_PIPELINE_VERSION;
  sourceArtifactId: string;
  referenceArtifactId?: string;
  template: EcommerceImageSetTemplate;
  size: EcommerceImageSetSize;
  prompt: string;
  stage: EcommerceImageSetJobStage;
  cutoutArtifactId?: string;
  plan?: EcommerceImageSetPlan;
  outputArtifactIds: string[];
  usage: EcommerceImageSetUsage[];
  evaluation?: EcommerceImageSetEvaluation;
  createdAt: string;
  updatedAt: string;
  error?: string;
};

export type ToolJob = EcommerceImageSetJob;

export type EcommerceImageSetJobPatch = Partial<Pick<
  EcommerceImageSetJob,
  | "stage"
  | "cutoutArtifactId"
  | "plan"
  | "outputArtifactIds"
  | "usage"
  | "evaluation"
  | "error"
  | "updatedAt"
>>;

export interface ToolJobStore {
  create(job: ToolJob): Promise<ToolJob>;
  get(jobId: string): Promise<ToolJob | null>;
  update(jobId: string, patch: EcommerceImageSetJobPatch): Promise<EcommerceImageSetJob>;
}
export function createEcommerceImageSetJob(input: {
  userId: string;
  sessionId: string;
  projectId?: string;
  sourceArtifactId: string;
  referenceArtifactId?: string;
  template: EcommerceImageSetTemplate;
  size: EcommerceImageSetSize;
  prompt: string;
  now?: Date;
}): EcommerceImageSetJob {
  const timestamp = (input.now ?? new Date()).toISOString();
  return {
    id: randomUUID(),
    userId: input.userId,
    sessionId: input.sessionId,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    toolId: "ecommerce-image-set",
    pipelineVersion: ECOMMERCE_IMAGE_SET_PIPELINE_VERSION,
    sourceArtifactId: input.sourceArtifactId,
    ...(input.referenceArtifactId ? { referenceArtifactId: input.referenceArtifactId } : {}),
    template: input.template,
    size: input.size,
    prompt: input.prompt,
    stage: "queued",
    outputArtifactIds: [],
    usage: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function isEcommerceImageSetJobStage(value: unknown): value is EcommerceImageSetJobStage {
  return typeof value === "string" && [
    "queued",
    "cutting_out",
    "planning",
    "generating",
    "review",
    "failed",
  ].includes(value);
}
