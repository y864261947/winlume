import { posix } from "node:path";
import { z } from "zod";

const skillIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "must be a lowercase package id")
  .max(96);

export const capabilityIdSchema = z.enum([
  "chat",
  "image.generate",
  "canvas.generate",
  "video.generate",
]);

export const productionToolNameSchema = z.enum([
  "todo_write",
  "write_artifact",
  "read_artifact",
  "list_artifacts",
  "generate_image",
  "generate_canvas",
]);

export const artifactKindSchema = z.enum([
  "markdown",
  "html",
  "text",
  "json",
  "image",
  "video",
  "video-analysis",
  "binary",
  "canvas",
]);

export const artifactOutputIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "must be a lowercase Artifact id")
  .max(96);

const artifactContractSchema = z
  .object({
    id: artifactOutputIdSchema,
    kinds: z.array(artifactKindSchema).min(1).max(8),
    required: z.boolean(),
  })
  .strict();

export const artifactRequirementSchema = artifactContractSchema;
export const artifactExpectationSchema = artifactContractSchema;

/**
 * Normalize a resource path without touching the filesystem. Packages may only
 * refer to files underneath their own directory.
 */
export function validateRelativeResourcePath(raw: string): string {
  const value = raw.trim();
  if (!value) throw new Error("Resource path is required");
  if (value.includes("\\") || value.includes("\0")) {
    throw new Error("Resource path must use a safe POSIX relative path");
  }
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value)) {
    throw new Error("Resource path must be relative");
  }

  const normalized = posix.normalize(value);
  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    posix.isAbsolute(normalized)
  ) {
    throw new Error("Resource path escapes the Skill package");
  }
  return normalized;
}

const resourcePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .superRefine((value, context) => {
    try {
      validateRelativeResourcePath(value);
    } catch {
      context.addIssue({
        code: "custom",
        message: "must be a safe relative resource path",
      });
    }
  })
  .transform((value) => validateRelativeResourcePath(value));

const resourceSchema = z
  .object({
    path: resourcePathSchema,
    when: z.string().trim().min(1).max(500),
  })
  .strict();

function reportDuplicateIds(
  entries: Array<{ id: string }>,
  context: z.RefinementCtx,
  path: "inputs" | "outputs",
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

export const skillContractSchema = z
  .object({
    schemaVersion: z.literal(2),
    id: skillIdSchema,
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "must be semver").max(32),
    stability: z.enum(["experimental", "stable"]),
    provenance: z
      .object({
        owner: z.literal("reizo"),
        source: z.enum(["first-party", "reviewed-import"]),
      })
      .strict(),
    requiredCapabilities: z.array(capabilityIdSchema).max(4),
    allowedTools: z.array(productionToolNameSchema).max(6),
    inputs: z.array(artifactRequirementSchema).max(12),
    outputs: z.array(artifactExpectationSchema).min(1).max(12),
    qualityChecks: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
    approvalPolicy: z.enum(["none", "on-blocking-review", "required"]),
    resources: z.array(resourceSchema).max(24).optional(),
  })
  .strict()
  .superRefine((contract, context) => {
    reportDuplicateIds(contract.inputs, context, "inputs");
    reportDuplicateIds(contract.outputs, context, "outputs");
  });

export type ProductionSkillContract = z.output<typeof skillContractSchema>;

export type SkillContractMeta = {
  schemaVersion: 2;
  version: string;
  stability: "experimental" | "stable";
  requiredCapabilities: string[];
  allowedTools: string[];
  approvalPolicy: "none" | "on-blocking-review" | "required";
};

export function parseSkillContract(
  raw: string,
  expectedId: string,
): ProductionSkillContract {
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Skill contract is not valid JSON");
  }

  const parsed = skillContractSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Skill contract does not match schema v2");
  }
  if (parsed.data.id !== expectedId) {
    throw new Error("Skill contract id must match its package directory");
  }
  return parsed.data;
}

export function toSkillContractMeta(
  contract: ProductionSkillContract,
): SkillContractMeta {
  return {
    schemaVersion: contract.schemaVersion,
    version: contract.version,
    stability: contract.stability,
    requiredCapabilities: [...contract.requiredCapabilities],
    allowedTools: [...contract.allowedTools],
    approvalPolicy: contract.approvalPolicy,
  };
}
