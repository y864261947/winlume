import type { IntakeField } from "@/lib/agent/production-packs/contracts";

export type WorkflowIntakeValues = Record<string, string | number | string[]>;

export type WorkflowIntakeValidation = {
  ok: boolean;
  values: WorkflowIntakeValues;
  errors: Record<string, string>;
};

export type WorkflowIntakeDraft = Record<string, unknown>;

export function workflowDraftKey(packId: string, version: string): string {
  return `winlume:workflow-intake:${packId}:${version}`;
}

export function initialWorkflowIntake(
  fields: readonly IntakeField[],
): WorkflowIntakeDraft {
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      field.type === "multi_select" ? [] : "",
    ]),
  );
}

export function reconcileWorkflowIntake(
  previousFields: readonly IntakeField[],
  nextFields: readonly IntakeField[],
  previousValues: unknown,
): WorkflowIntakeDraft {
  const previousById = new Map(
    previousFields.map((field) => [field.id, field] as const),
  );
  const previous = asRecord(previousValues);
  const reconciled = initialWorkflowIntake(nextFields);

  for (const field of nextFields) {
    const previousField = previousById.get(field.id);
    const value = previous[field.id];
    if (!previousField || previousField.type !== field.type || value === undefined) {
      continue;
    }

    if (field.type === "multi_select") {
      if (!Array.isArray(value)) continue;
      const allowed = new Set(field.options.map((option) => option.value));
      reconciled[field.id] = [...new Set(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => allowed.has(item)),
      )];
      continue;
    }

    if (field.type === "select") {
      if (
        typeof value === "string" &&
        field.options.some((option) => option.value === value.trim())
      ) {
        reconciled[field.id] = value.trim();
      }
      continue;
    }

    if (field.type === "number") {
      if (typeof value === "number" || typeof value === "string") {
        reconciled[field.id] = value;
      }
      continue;
    }

    if (typeof value === "string") reconciled[field.id] = value;
  }

  return reconciled;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function addError(
  errors: Record<string, string>,
  field: IntakeField,
  message: string,
): void {
  errors[field.id] = message;
}

export function validateWorkflowIntake(
  fields: readonly IntakeField[],
  raw: unknown,
): WorkflowIntakeValidation {
  const supplied = asRecord(raw);
  const values: WorkflowIntakeValues = {};
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = supplied[field.id];
    if (field.type === "text") {
      if (typeof value !== "string") {
        if (field.required) addError(errors, field, "请输入内容");
        continue;
      }
      const normalized = value.trim();
      if (!normalized) {
        if (field.required) addError(errors, field, "请输入内容");
        continue;
      }
      values[field.id] = normalized;
      continue;
    }

    if (field.type === "url") {
      if (typeof value !== "string" || !value.trim()) {
        if (field.required) addError(errors, field, "请输入 http 或 https 地址");
        continue;
      }
      const normalized = value.trim();
      try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          addError(errors, field, "请输入 http 或 https 地址");
          continue;
        }
        values[field.id] = parsed.toString();
      } catch {
        addError(errors, field, "请输入 http 或 https 地址");
      }
      continue;
    }

    if (field.type === "multi_select") {
      if (value === undefined || value === null) {
        if (field.required) addError(errors, field, "请选择至少一项");
        continue;
      }
      if (!Array.isArray(value)) {
        addError(errors, field, "请选择提供的选项");
        continue;
      }
      const options = new Set(field.options.map((option) => option.value));
      const normalized = value.map((item) =>
        typeof item === "string" ? item.trim() : "",
      );
      if (normalized.some((item) => !item || !options.has(item))) {
        addError(errors, field, "请选择提供的选项");
        continue;
      }
      const deduplicated = [...new Set(normalized)];
      if (deduplicated.length === 0) {
        if (field.required) addError(errors, field, "请选择至少一项");
        continue;
      }
      values[field.id] = deduplicated;
      continue;
    }

    if (field.type === "number") {
      const normalized =
        typeof value === "number"
          ? value
          : typeof value === "string" && value.trim()
            ? Number(value.trim())
            : undefined;
      if (normalized === undefined) {
        if (field.required) addError(errors, field, "请输入有限数字");
        continue;
      }
      if (!Number.isFinite(normalized)) {
        addError(errors, field, "请输入有限数字");
        continue;
      }
      values[field.id] = normalized;
      continue;
    }

    if (field.type === "select") {
      if (typeof value !== "string" || !value.trim()) {
        if (field.required) addError(errors, field, "请选择一个选项");
        continue;
      }
      const normalized = value.trim();
      if (!field.options.some((option) => option.value === normalized)) {
        addError(errors, field, "请选择提供的选项");
        continue;
      }
      values[field.id] = normalized;
      continue;
    }

    if (field.type === "artifact") {
      if (typeof value !== "string" || !value.trim()) {
        if (field.required) addError(errors, field, "请选择作品");
        continue;
      }
      values[field.id] = value.trim();
    }
  }

  return {
    ok: Object.keys(errors).length === 0,
    values,
    errors,
  };
}
