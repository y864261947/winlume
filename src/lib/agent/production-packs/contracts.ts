import { z } from "zod";
import {
  artifactExpectationSchema,
  artifactKindSchema,
  artifactRequirementSchema,
  capabilityIdSchema,
  productionToolNameSchema,
} from "@/lib/agent/skills/contracts";

const packageIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "must be a lowercase package id")
  .max(96);

const sceneIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "must be a URL-safe scene id")
  .max(96);

function reportDuplicateIds(
  entries: Array<{ id: string }>,
  context: z.RefinementCtx,
  path:
    | "stages"
    | "requiredInputs"
    | "outputs"
    | "intake"
    | "expectedArtifacts",
) {
  const seen = new Set<string>();
  entries.forEach((entry, index) => {
    if (seen.has(entry.id)) {
      context.addIssue({
        code: "custom",
        path: [path, index, "id"],
        message: `duplicate ${path} id`,
      });
      return;
    }
    seen.add(entry.id);
  });
}

function reportDuplicateOptions(
  options: Array<{ value: string }>,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  options.forEach((option, index) => {
    if (seen.has(option.value)) {
      context.addIssue({
        code: "custom",
        path: ["options", index],
        message: "duplicate intake option",
      });
      return;
    }
    seen.add(option.value);
  });
}

const intakeFieldBaseSchema = z.object({
  id: packageIdSchema,
  label: z.string().trim().min(1).max(120),
  required: z.boolean(),
  description: z.string().trim().min(1).max(500),
});

const intakeOptionSchema = z
  .object({
    value: packageIdSchema,
    label: z.string().trim().min(1).max(120),
  })
  .strict();

const intakeOptionsSchema = z
  .array(intakeOptionSchema)
  .min(1)
  .max(20)
  .superRefine(reportDuplicateOptions);

export const intakeFieldSchema = z.discriminatedUnion("type", [
  intakeFieldBaseSchema.extend({ type: z.literal("text") }).strict(),
  intakeFieldBaseSchema.extend({ type: z.literal("url") }).strict(),
  intakeFieldBaseSchema.extend({ type: z.literal("number") }).strict(),
  intakeFieldBaseSchema
    .extend({ type: z.literal("select"), options: intakeOptionsSchema })
    .strict(),
  intakeFieldBaseSchema
    .extend({ type: z.literal("multi_select"), options: intakeOptionsSchema })
    .strict(),
  intakeFieldBaseSchema
    .extend({
      type: z.literal("artifact"),
      kinds: z.array(artifactKindSchema).min(1).max(8),
    })
    .strict(),
]);

function reportDuplicateStrings(
  values: string[],
  context: z.RefinementCtx,
  path: "sceneIds" | "requiredCapabilities" | "skillIds" | "allowedTools",
) {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    if (seen.has(value)) {
      context.addIssue({
        code: "custom",
        path: [path, index],
        message: `duplicate ${path} value`,
      });
      return;
    }
    seen.add(value);
  });
}

export const productionStageSchema = z
  .object({
    id: packageIdSchema,
    title: z.string().trim().min(1).max(120),
    objective: z.string().trim().min(1).max(1_000),
    handoffSummary: z.string().trim().min(1).max(500).optional(),
    skillIds: z.array(packageIdSchema).min(1).max(8),
    requiredInputs: z.array(artifactRequirementSchema).max(12),
    outputs: z.array(artifactExpectationSchema).min(1).max(12),
    allowedTools: z.array(productionToolNameSchema).max(6),
    qualityChecks: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
    approvalPolicy: z.enum(["none", "on-blocking-review", "required"]),
    maxAutomaticRevisions: z.number().int().min(0).max(2),
  })
  .strict()
  .superRefine((stage, context) => {
    reportDuplicateStrings(stage.skillIds, context, "skillIds");
    reportDuplicateStrings(stage.allowedTools, context, "allowedTools");
    reportDuplicateIds(stage.requiredInputs, context, "requiredInputs");
    reportDuplicateIds(stage.outputs, context, "outputs");
  });

export const productionPackSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: packageIdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "must be semver").max(32),
    sceneIds: z.array(sceneIdSchema).min(1).max(8),
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(500),
    requiredCapabilities: z.array(capabilityIdSchema).max(4),
    intake: z.array(intakeFieldSchema).max(24).default([]),
    expectedArtifacts: z
      .array(artifactExpectationSchema)
      .min(1)
      .max(24)
      .default([]),
    stages: z.array(productionStageSchema).min(1).max(20),
  })
  .strict()
  .superRefine((pack, context) => {
    reportDuplicateStrings(pack.sceneIds, context, "sceneIds");
    reportDuplicateStrings(
      pack.requiredCapabilities,
      context,
      "requiredCapabilities",
    );
    reportDuplicateIds(pack.intake, context, "intake");
    reportDuplicateIds(pack.expectedArtifacts, context, "expectedArtifacts");
    reportDuplicateIds(pack.stages, context, "stages");

    const hasWorkflowGraphMetadata =
      pack.intake.length > 0 ||
      pack.expectedArtifacts.length > 0 ||
      pack.stages.some((stage) => stage.handoffSummary !== undefined);
    if (!hasWorkflowGraphMetadata) return;

    const availableInputKinds = new Map<string, Set<string>>(
      pack.intake
        .filter((field) => field.type === "artifact")
        .map((field) => [field.id, new Set<string>(field.kinds)] as const),
    );
    const outputIds = new Set<string>();
    const outputKinds = new Map<string, Set<string>>();

    pack.stages.forEach((stage, stageIndex) => {
      stage.requiredInputs.forEach((input, inputIndex) => {
        const sourceKinds = availableInputKinds.get(input.id);
        if (!sourceKinds) {
          context.addIssue({
            code: "custom",
            path: ["stages", stageIndex, "requiredInputs", inputIndex, "id"],
            message:
              "required input must reference Artifact intake or an earlier Stage output",
          });
        } else if (!input.kinds.some((kind) => sourceKinds.has(kind))) {
          context.addIssue({
            code: "custom",
            path: ["stages", stageIndex, "requiredInputs", inputIndex, "kinds"],
            message: "required input kinds are incompatible with its source",
          });
        }
      });

      stage.outputs.forEach((output, outputIndex) => {
        if (outputIds.has(output.id)) {
          context.addIssue({
            code: "custom",
            path: ["stages", stageIndex, "outputs", outputIndex, "id"],
            message: "duplicate Stage output id",
          });
        }
        if (!outputIds.has(output.id)) {
          const kinds = new Set<string>(output.kinds);
          outputIds.add(output.id);
          outputKinds.set(output.id, kinds);
          availableInputKinds.set(output.id, kinds);
        }
      });
    });

    pack.expectedArtifacts.forEach((artifact, artifactIndex) => {
      const declaredKinds = outputKinds.get(artifact.id);
      if (!declaredKinds) {
        context.addIssue({
          code: "custom",
          path: ["expectedArtifacts", artifactIndex, "id"],
          message: "expected Artifact must reference a declared Stage output",
        });
      } else if (!artifact.kinds.some((kind) => declaredKinds.has(kind))) {
        context.addIssue({
          code: "custom",
          path: ["expectedArtifacts", artifactIndex, "kinds"],
          message: "expected Artifact kinds are incompatible with its Stage output",
        });
      }
    });
  });

export type ProductionStage = z.output<typeof productionStageSchema>;
export type IntakeField = z.output<typeof intakeFieldSchema>;
export type ProductionPack = z.output<typeof productionPackSchema>;

export type ProductionPackMeta = Pick<
  ProductionPack,
  | "id"
  | "version"
  | "sceneIds"
  | "title"
  | "summary"
  | "requiredCapabilities"
  | "intake"
  | "expectedArtifacts"
> & {
  stages: Array<
    Pick<
      ProductionStage,
      | "id"
      | "title"
      | "handoffSummary"
      | "outputs"
      | "approvalPolicy"
      | "maxAutomaticRevisions"
    >
  >;
};

export function parseProductionPack(
  raw: string,
  expectedId?: string,
): ProductionPack {
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Production Pack is not valid JSON");
  }

  const parsed = productionPackSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Production Pack does not match schema v1");
  }
  if (expectedId && parsed.data.id !== expectedId) {
    throw new Error("Production Pack id must match its package directory");
  }
  return parsed.data;
}

export function validatePackSkills(
  pack: ProductionPack,
  availableSkillIds: ReadonlySet<string>,
): void {
  const missing = [...new Set(pack.stages.flatMap((stage) => stage.skillIds))].filter(
    (id) => !availableSkillIds.has(id),
  );
  if (missing.length > 0) {
    throw new Error("Production Pack references unavailable Skills");
  }
}

export function toProductionPackMeta(pack: ProductionPack): ProductionPackMeta {
  return {
    id: pack.id,
    version: pack.version,
    sceneIds: [...pack.sceneIds],
    title: pack.title,
    summary: pack.summary,
    requiredCapabilities: [...pack.requiredCapabilities],
    intake: pack.intake.map((field) => ({
      ...field,
      ...(field.type === "select" || field.type === "multi_select"
        ? { options: [...field.options] }
        : {}),
    })),
    expectedArtifacts: pack.expectedArtifacts.map((artifact) => ({
      ...artifact,
      kinds: [...artifact.kinds],
    })),
    stages: pack.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      handoffSummary: stage.handoffSummary,
      outputs: stage.outputs.map((output) => ({ ...output, kinds: [...output.kinds] })),
      approvalPolicy: stage.approvalPolicy,
      maxAutomaticRevisions: stage.maxAutomaticRevisions,
    })),
  };
}
