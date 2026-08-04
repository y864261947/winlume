import { z } from "zod";
import type { JsonObject } from "@/lib/agent/infrastructure/types";
import { productionPackSchema, type ProductionPack } from "./contracts";
import {
  parseWorkflowSessionBinding,
  type WorkflowSessionBinding,
} from "./session-binding";

const idSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9_-]*$/)
  .max(160);

const stringListSchema = z
  .array(z.string().trim().min(1).max(240))
  .max(64)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: "duplicate values" });
    }
  });

const intakeValueSchema = z.union([
  z.string().trim().min(1).max(4_000),
  z.number().finite(),
  stringListSchema,
]);

const artifactMapSchema = z.record(idSchema, stringListSchema);

const productionDecisionSchema = z
  .object({
    id: idSchema,
    type: z.enum(["approved", "changes_requested", "iteration_started"]),
    actorId: z.string().trim().min(1).max(160),
    occurredAt: z.string().datetime({ offset: true }),
    note: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

const productionReviewSchema = z
  .object({
    status: z.enum(["pending", "approved", "changes_requested"]),
    decidedBy: z.string().trim().min(1).max(160).optional(),
    decidedAt: z.string().datetime({ offset: true }).optional(),
    note: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

export const productionRunMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    workflowId: idSchema,
    pack: z
      .object({
        id: idSchema,
        version: z.string().regex(/^\d+\.\d+\.\d+$/).max(32),
      })
      .strict(),
    packSnapshot: productionPackSchema.optional(),
    intakeValues: z.record(idSchema, intakeValueSchema),
    completedStageIds: z.array(idSchema).max(20),
    execution: z
      .object({
        stageId: idSchema,
        stageIndex: z.number().int().min(0).max(19),
        iteration: z.number().int().min(0).max(20),
        predecessorRunId: z.string().trim().min(1).max(160).optional(),
        skillIds: z.array(idSchema).min(1).max(8),
        allowedTools: z.array(idSchema).max(12),
      })
      .strict(),
    artifacts: z
      .object({
        inputs: artifactMapSchema,
        outputs: artifactMapSchema,
      })
      .strict(),
    phase: z.enum([
      "executing",
      "awaiting_approval",
      "ready_for_next",
      "needs_revision",
      "workflow_completed",
      "failed",
    ]),
    review: productionReviewSchema.optional(),
    decisions: z.array(productionDecisionSchema).max(100),
  })
  .strict();

export type ProductionRunMetadata = z.output<typeof productionRunMetadataSchema>;

export type StartProductionStageEffect = {
  type: "start_stage";
  idempotencyScope: string;
  idempotencyKey: string;
  stageId: string;
  skillIds: string[];
  referencedArtifactIds: string[];
};

export type ProductionEffect =
  | StartProductionStageEffect
  | { type: "none" }
  | { type: "workflow_complete" };

export type ProductionTransition = {
  state: ProductionRunMetadata;
  effect: ProductionEffect;
};

export type StartProductionStageTransition = {
  state: ProductionRunMetadata;
  effect: StartProductionStageEffect;
};

function currentStage(pack: ProductionPack, state: ProductionRunMetadata) {
  if (state.pack.id !== pack.id || state.pack.version !== pack.version) {
    throw new Error("Production state does not match the Pack version");
  }
  const stage = pack.stages[state.execution.stageIndex];
  if (!stage || stage.id !== state.execution.stageId) {
    throw new Error("Production state points to an unavailable Stage");
  }
  return stage;
}

function completeCurrentStage(
  pack: ProductionPack,
  state: ProductionRunMetadata,
): ProductionTransition {
  const stage = currentStage(pack, state);
  const completedStageIds = state.completedStageIds.includes(stage.id)
    ? state.completedStageIds
    : [...state.completedStageIds, stage.id];
  const workflowComplete = state.execution.stageIndex === pack.stages.length - 1;
  return {
    state: productionRunMetadataSchema.parse({
      ...state,
      completedStageIds,
      phase: workflowComplete ? "workflow_completed" : "ready_for_next",
    }),
    effect: { type: workflowComplete ? "workflow_complete" : "none" },
  };
}

export function prepareFirstProductionStage(
  pack: ProductionPack,
  rawBinding: WorkflowSessionBinding,
): StartProductionStageTransition {
  const binding = parseWorkflowSessionBinding(rawBinding);
  if (binding.packId !== pack.id || binding.packVersion !== pack.version) {
    throw new Error("Workflow binding does not match the requested Pack version");
  }

  const firstStage = pack.stages[0];
  const inputs: Record<string, string[]> = {};
  for (const field of pack.intake) {
    if (field.type !== "artifact") continue;
    const artifactId = binding.intakeValues[field.id];
    if (typeof artifactId === "string") inputs[field.id] = [artifactId];
  }

  const state = productionRunMetadataSchema.parse({
    schemaVersion: 1,
    workflowId: binding.workflowId,
    pack: { id: pack.id, version: pack.version },
    packSnapshot: pack,
    intakeValues: binding.intakeValues,
    completedStageIds: [],
    execution: {
      stageId: firstStage.id,
      stageIndex: 0,
      iteration: 0,
      skillIds: firstStage.skillIds,
      allowedTools: firstStage.allowedTools,
    },
    artifacts: { inputs, outputs: {} },
    phase: "executing",
    decisions: [],
  });

  return {
    state,
    effect: {
      type: "start_stage",
      idempotencyScope: `workflow:${binding.workflowId}`,
      idempotencyKey: `stage:${firstStage.id}:iteration:0`,
      stageId: firstStage.id,
      skillIds: [...firstStage.skillIds],
      referencedArtifactIds: [...binding.inputArtifactIds],
    },
  };
}

export function recordProductionStageResult(
  pack: ProductionPack,
  rawState: ProductionRunMetadata,
  outputArtifactIds: Record<string, string[]>,
): ProductionTransition {
  const state = parseProductionRunMetadata(rawState);
  const stage = currentStage(pack, state);
  if (state.phase !== "executing") {
    throw new Error("Stage results can only be recorded while executing");
  }

  const declaredOutputIds = new Set(stage.outputs.map((output) => output.id));
  const unknownOutput = Object.keys(outputArtifactIds).find(
    (id) => !declaredOutputIds.has(id),
  );
  if (unknownOutput) throw new Error(`Unknown Stage output: ${unknownOutput}`);
  for (const output of stage.outputs) {
    if (output.required && !outputArtifactIds[output.id]?.length) {
      throw new Error(`Required Stage output is missing: ${output.id}`);
    }
  }

  // Structured blocking-review results arrive in Phase 4. Until then, the
  // conservative interpretation is to require an explicit human decision.
  const approvalRequired = stage.approvalPolicy !== "none";
  const nextState = productionRunMetadataSchema.parse({
    ...state,
    artifacts: {
      ...state.artifacts,
      outputs: { ...state.artifacts.outputs, ...outputArtifactIds },
    },
    ...(approvalRequired
      ? {
          phase: "awaiting_approval",
          review: { status: "pending" },
        }
      : {}),
  });
  if (approvalRequired) {
    return { state: nextState, effect: { type: "none" } };
  }
  return completeCurrentStage(pack, nextState);
}

export function failProductionStage(
  rawState: ProductionRunMetadata,
): ProductionRunMetadata {
  const state = parseProductionRunMetadata(rawState);
  if (state.phase === "failed") return state;
  return productionRunMetadataSchema.parse({ ...state, phase: "failed" });
}

export function approveProductionStage(
  pack: ProductionPack,
  rawState: ProductionRunMetadata,
  decision: {
    decisionId: string;
    actorId: string;
    occurredAt: string;
    note?: string;
  },
): ProductionTransition {
  const state = parseProductionRunMetadata(rawState);
  currentStage(pack, state);
  const existing = state.decisions.find((item) => item.id === decision.decisionId);
  if (existing) {
    if (
      existing.type !== "approved" ||
      existing.actorId !== decision.actorId ||
      existing.note !== decision.note
    ) {
      throw new Error("Decision id already belongs to a different action");
    }
    if (state.phase === "awaiting_approval") {
      return completeCurrentStage(pack, state);
    }
    return {
      state,
      effect: {
        type:
          state.phase === "workflow_completed" ? "workflow_complete" : "none",
      },
    };
  }
  if (state.phase !== "awaiting_approval") {
    throw new Error("Stage is not awaiting approval");
  }

  const approved = productionRunMetadataSchema.parse({
    ...state,
    review: {
      status: "approved",
      decidedBy: decision.actorId,
      decidedAt: decision.occurredAt,
      ...(decision.note ? { note: decision.note } : {}),
    },
    decisions: [
      ...state.decisions,
      {
        id: decision.decisionId,
        type: "approved",
        actorId: decision.actorId,
        occurredAt: decision.occurredAt,
        ...(decision.note ? { note: decision.note } : {}),
      },
    ],
  });
  return completeCurrentStage(pack, approved);
}

export function requestProductionChanges(
  pack: ProductionPack,
  rawState: ProductionRunMetadata,
  decision: {
    decisionId: string;
    actorId: string;
    occurredAt: string;
    note: string;
  },
): ProductionTransition {
  const state = parseProductionRunMetadata(rawState);
  currentStage(pack, state);
  const existing = state.decisions.find((item) => item.id === decision.decisionId);
  if (existing) {
    if (
      existing.type !== "changes_requested" ||
      existing.actorId !== decision.actorId ||
      existing.note !== decision.note
    ) {
      throw new Error("Decision id already belongs to a different action");
    }
    return { state, effect: { type: "none" } };
  }
  if (
    state.phase === "needs_revision" &&
    state.review?.status === "changes_requested" &&
    state.review.decidedBy === decision.actorId &&
    state.review.note === decision.note
  ) {
    return { state, effect: { type: "none" } };
  }
  if (state.phase !== "awaiting_approval") {
    throw new Error("Stage is not awaiting approval");
  }

  const requested = productionRunMetadataSchema.parse({
    ...state,
    phase: "needs_revision",
    review: {
      status: "changes_requested",
      decidedBy: decision.actorId,
      decidedAt: decision.occurredAt,
      note: decision.note,
    },
    decisions: [
      ...state.decisions,
      {
        id: decision.decisionId,
        type: "changes_requested",
        actorId: decision.actorId,
        occurredAt: decision.occurredAt,
        note: decision.note,
      },
    ],
  });
  return { state: requested, effect: { type: "none" } };
}

export function prepareProductionRevision(
  pack: ProductionPack,
  rawState: ProductionRunMetadata,
  input: { predecessorRunId: string },
): StartProductionStageTransition {
  const state = parseProductionRunMetadata(rawState);
  const stage = currentStage(pack, state);
  if (state.phase !== "needs_revision") {
    throw new Error("Stage does not need revision");
  }
  const iteration = state.execution.iteration + 1;
  if (iteration > 20) throw new Error("Workflow Stage revision limit exceeded");

  const nextState = productionRunMetadataSchema.parse({
    ...state,
    execution: {
      ...state.execution,
      iteration,
      predecessorRunId: input.predecessorRunId,
      skillIds: stage.skillIds,
      allowedTools: state.execution.allowedTools,
    },
    phase: "executing",
    review: undefined,
  });
  const referencedArtifactIds = [
    ...new Set([
      ...Object.values(state.artifacts.inputs).flat(),
      ...stage.outputs.flatMap(
        (output) => state.artifacts.outputs[output.id] ?? [],
      ),
    ]),
  ];

  return {
    state: nextState,
    effect: {
      type: "start_stage",
      idempotencyScope: `workflow:${state.workflowId}`,
      idempotencyKey: `stage:${stage.id}:iteration:${iteration}`,
      stageId: stage.id,
      skillIds: [...stage.skillIds],
      referencedArtifactIds,
    },
  };
}

export function prepareProductionRetry(
  pack: ProductionPack,
  rawState: ProductionRunMetadata,
  input: { predecessorRunId: string },
): StartProductionStageTransition {
  const state = parseProductionRunMetadata(rawState);
  const stage = currentStage(pack, state);
  if (state.phase !== "failed" && state.phase !== "executing") {
    throw new Error("Workflow Stage is not retryable");
  }
  const iteration = state.execution.iteration + 1;
  if (iteration > 20) throw new Error("Workflow Stage retry limit exceeded");

  const currentOutputIds = new Set(stage.outputs.map((output) => output.id));
  const preservedOutputs = Object.fromEntries(
    Object.entries(state.artifacts.outputs).filter(
      ([outputId]) => !currentOutputIds.has(outputId),
    ),
  );
  const nextState = productionRunMetadataSchema.parse({
    ...state,
    execution: {
      ...state.execution,
      iteration,
      predecessorRunId: input.predecessorRunId,
      skillIds: stage.skillIds,
      allowedTools: stage.allowedTools,
    },
    artifacts: {
      inputs: state.artifacts.inputs,
      outputs: preservedOutputs,
    },
    phase: "executing",
    review: undefined,
  });
  const referencedArtifactIds = [
    ...new Set(Object.values(state.artifacts.inputs).flat()),
  ];

  return {
    state: nextState,
    effect: {
      type: "start_stage",
      idempotencyScope: `workflow:${state.workflowId}`,
      idempotencyKey: `stage:${stage.id}:iteration:${iteration}`,
      stageId: stage.id,
      skillIds: [...stage.skillIds],
      referencedArtifactIds,
    },
  };
}

export function prepareNextProductionStage(
  pack: ProductionPack,
  rawState: ProductionRunMetadata,
  input: { predecessorRunId: string },
): StartProductionStageTransition {
  const state = parseProductionRunMetadata(rawState);
  currentStage(pack, state);
  if (state.phase !== "ready_for_next") {
    throw new Error("Workflow is not ready for the next Stage");
  }

  const stageIndex = state.execution.stageIndex + 1;
  const stage = pack.stages[stageIndex];
  if (!stage) throw new Error("Workflow has no next Stage");
  const inputs: Record<string, string[]> = {};
  for (const requirement of stage.requiredInputs) {
    const artifactIds =
      state.artifacts.outputs[requirement.id] ??
      state.artifacts.inputs[requirement.id];
    if (requirement.required && !artifactIds?.length) {
      throw new Error(`Required Stage input is missing: ${requirement.id}`);
    }
    if (artifactIds?.length) inputs[requirement.id] = artifactIds;
  }

  const nextState = productionRunMetadataSchema.parse({
    ...state,
    execution: {
      stageId: stage.id,
      stageIndex,
      iteration: 0,
      predecessorRunId: input.predecessorRunId,
      skillIds: stage.skillIds,
      allowedTools: stage.allowedTools,
    },
    artifacts: { inputs, outputs: state.artifacts.outputs },
    phase: "executing",
    review: undefined,
  });
  const referencedArtifactIds = [
    ...new Set(Object.values(inputs).flat()),
  ];

  return {
    state: nextState,
    effect: {
      type: "start_stage",
      idempotencyScope: `workflow:${state.workflowId}`,
      idempotencyKey: `stage:${stage.id}:iteration:0`,
      stageId: stage.id,
      skillIds: [...stage.skillIds],
      referencedArtifactIds,
    },
  };
}

export function recordProductionStageStartDecision(
  pack: ProductionPack,
  rawState: ProductionRunMetadata,
  decision: {
    decisionId: string;
    actorId: string;
    occurredAt: string;
  },
): ProductionTransition {
  const state = parseProductionRunMetadata(rawState);
  currentStage(pack, state);
  const existing = state.decisions.find((item) => item.id === decision.decisionId);
  if (existing) {
    if (
      existing.type !== "iteration_started" ||
      existing.actorId !== decision.actorId ||
      existing.note !== undefined
    ) {
      throw new Error("Decision id already belongs to a different action");
    }
    return { state, effect: { type: "none" } };
  }
  if (state.phase !== "ready_for_next") {
    throw new Error("Workflow is not ready for the next Stage");
  }
  return {
    state: productionRunMetadataSchema.parse({
      ...state,
      decisions: [
        ...state.decisions,
        {
          id: decision.decisionId,
          type: "iteration_started",
          actorId: decision.actorId,
          occurredAt: decision.occurredAt,
        },
      ],
    }),
    effect: { type: "none" },
  };
}

export function parseProductionRunMetadata(raw: unknown): ProductionRunMetadata {
  const parsed = productionRunMetadataSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Invalid production Run metadata");
  return parsed.data;
}

export function serializeProductionRunMetadata(
  metadata: ProductionRunMetadata,
): JsonObject {
  return productionRunMetadataSchema.parse(metadata) as unknown as JsonObject;
}
