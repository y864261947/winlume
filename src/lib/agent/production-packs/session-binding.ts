import { z } from "zod";
import type {
  SessionWorkflowBinding,
  WorkflowIntakeValue,
} from "@/lib/agent/types";
import {
  productionPackSchema,
  type IntakeField,
  type ProductionPack,
} from "./contracts";

export type WorkflowSessionBinding = SessionWorkflowBinding;

export class WorkflowSessionBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowSessionBindingError";
  }
}

const bindingIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9_-]*$/)
  .max(96);

const storedStringArraySchema = z
  .array(z.string().trim().min(1).max(4_000))
  .max(20)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: "duplicate stored values" });
    }
  });

const workflowSessionBindingSchema = z
  .object({
    schemaVersion: z.literal(1),
    workflowId: bindingIdSchema,
    packId: bindingIdSchema,
    packVersion: z.string().regex(/^\d+\.\d+\.\d+$/).max(32),
    packSnapshot: productionPackSchema.optional(),
    intakeValues: z.record(
      bindingIdSchema,
      z.union([
        z.string().trim().min(1).max(4_000),
        z.number().finite(),
        storedStringArraySchema,
      ]),
    ),
    inputArtifactIds: storedStringArraySchema,
    boundAt: z.string().datetime({ offset: true }),
  })
  .strict();

function invalid(field: IntakeField, reason: string): never {
  throw new WorkflowSessionBindingError(`Invalid intake field ${field.id}: ${reason}`);
}

function optionalEmpty(field: IntakeField, value: unknown): boolean {
  if (field.required) return false;
  return value === undefined || value === null || value === "";
}

function normalizeString(field: IntakeField, value: unknown): string | undefined {
  if (optionalEmpty(field, value)) return undefined;
  if (typeof value !== "string") invalid(field, "must be a string");
  const normalized = value.trim();
  if (!normalized) invalid(field, "is required");
  if (normalized.length > 4_000) invalid(field, "is too long");
  return normalized;
}

function normalizeField(
  field: IntakeField,
  value: unknown,
): WorkflowIntakeValue | undefined {
  switch (field.type) {
    case "text":
    case "artifact":
      return normalizeString(field, value);
    case "url": {
      const normalized = normalizeString(field, value);
      if (normalized === undefined) return undefined;
      let parsed: URL;
      try {
        parsed = new URL(normalized);
      } catch {
        return invalid(field, "must be a valid URL");
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return invalid(field, "must use http or https");
      }
      return parsed.toString();
    }
    case "number":
      if (optionalEmpty(field, value)) return undefined;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return invalid(field, "must be a finite number");
      }
      return value;
    case "select": {
      const normalized = normalizeString(field, value);
      if (normalized === undefined) return undefined;
      if (!field.options.some((option) => option.value === normalized)) {
        return invalid(field, "must be one of the declared options");
      }
      return normalized;
    }
    case "multi_select": {
      if (!field.required && (value === undefined || value === null)) return undefined;
      if (!Array.isArray(value)) invalid(field, "must be an array");
      const normalized = value.map((item) => {
        if (typeof item !== "string" || !item.trim()) {
          return invalid(field, "must contain non-empty strings");
        }
        return item.trim();
      });
      if (field.required && normalized.length === 0) invalid(field, "is required");
      if (new Set(normalized).size !== normalized.length) {
        return invalid(field, "must not contain duplicate values");
      }
      if (
        normalized.some(
          (item) => !field.options.some((option) => option.value === item),
        )
      ) {
        return invalid(field, "must contain only declared options");
      }
      return normalized;
    }
  }
}

export function createWorkflowSessionBinding(
  pack: ProductionPack,
  rawIntake: unknown,
  options: { workflowId: string; now?: Date },
): WorkflowSessionBinding {
  const workflowId = bindingIdSchema.safeParse(options.workflowId);
  if (!workflowId.success) {
    throw new WorkflowSessionBindingError("Invalid workflow id");
  }
  if (
    typeof rawIntake !== "object" ||
    rawIntake === null ||
    Array.isArray(rawIntake)
  ) {
    throw new WorkflowSessionBindingError("Workflow intake must be an object");
  }

  const supplied = rawIntake as Record<string, unknown>;
  const declaredIds = new Set(pack.intake.map((field) => field.id));
  const unknownId = Object.keys(supplied).find((id) => !declaredIds.has(id));
  if (unknownId) {
    throw new WorkflowSessionBindingError(`Unknown intake field: ${unknownId}`);
  }

  const intakeValues: Record<string, WorkflowIntakeValue> = {};
  const inputArtifactIds: string[] = [];
  for (const field of pack.intake) {
    const value = normalizeField(field, supplied[field.id]);
    if (value === undefined) continue;
    intakeValues[field.id] = value;
    if (field.type === "artifact") inputArtifactIds.push(value as string);
  }

  return {
    schemaVersion: 1,
    workflowId: workflowId.data,
    packId: pack.id,
    packVersion: pack.version,
    packSnapshot: pack,
    intakeValues,
    inputArtifactIds: [...new Set(inputArtifactIds)],
    boundAt: (options.now ?? new Date()).toISOString(),
  };
}

export function parseWorkflowSessionBinding(
  raw: unknown,
): WorkflowSessionBinding {
  const parsed = workflowSessionBindingSchema.safeParse(raw);
  if (!parsed.success) {
    throw new WorkflowSessionBindingError("Invalid stored workflow binding");
  }
  return parsed.data;
}
