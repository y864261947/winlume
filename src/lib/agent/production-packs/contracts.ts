import { z } from "zod";
import {
  artifactExpectationSchema,
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
  path: "stages" | "requiredInputs" | "outputs",
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
    reportDuplicateIds(pack.stages, context, "stages");
  });

export type ProductionStage = z.output<typeof productionStageSchema>;
export type ProductionPack = z.output<typeof productionPackSchema>;

export type ProductionPackMeta = Pick<
  ProductionPack,
  "id" | "version" | "sceneIds" | "title" | "summary" | "requiredCapabilities"
> & {
  stages: Array<
    Pick<
      ProductionStage,
      "id" | "title" | "outputs" | "approvalPolicy" | "maxAutomaticRevisions"
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
    stages: pack.stages.map((stage) => ({
      id: stage.id,
      title: stage.title,
      outputs: stage.outputs.map((output) => ({ ...output, kinds: [...output.kinds] })),
      approvalPolicy: stage.approvalPolicy,
      maxAutomaticRevisions: stage.maxAutomaticRevisions,
    })),
  };
}
