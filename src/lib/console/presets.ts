import type {
  PersonalityPresetRecord,
  PresetScope,
  ToolPresetRecord,
  UpdatePersonalityPresetInput,
  UpdateToolPresetInput,
} from "@/lib/platform";
import type {
  ConsolePersonalityPreset,
  ConsolePresets,
  ConsoleToolPreset,
} from "./types";
import { ConsoleRequestError, type ConsoleRequestContext } from "./server";
import {
  ensureOrganizationResourceManager,
  findConsoleOrganization,
  listConsoleOrganizations,
  requireConsoleOrganization,
} from "./workspace";

export const presetKinds = ["personality", "tool"] as const;
export type ConsolePresetKind = (typeof presetKinds)[number];

type InputRecord = Record<string, unknown>;

type ParsedCreateInput = {
  kind: ConsolePresetKind;
  scope: PresetScope;
  organizationId: string | null;
  name: string;
  description: string | null;
  instructions?: string;
  toolConfiguration?: Record<string, unknown>;
  isDefault: boolean;
};

function objectInput(value: unknown): InputRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConsoleRequestError("请求内容无效。", 400, "invalid_request");
  }
  return value as InputRecord;
}

export function parsePresetKind(value: unknown): ConsolePresetKind {
  if (typeof value === "string" && presetKinds.includes(value as ConsolePresetKind)) {
    return value as ConsolePresetKind;
  }
  throw new ConsoleRequestError("未找到该预设类型。", 404, "preset_kind_not_found");
}

function optionalString(value: unknown, field: string, maximum: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ConsoleRequestError(`${field}无效。`, 400, "invalid_preset_input");
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new ConsoleRequestError(`${field}不能超过 ${maximum} 个字符。`, 400, "invalid_preset_input");
  }
  return normalized;
}

function descriptionFrom(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return optionalString(value, "描述", 2_000) || null;
}

function configurationFrom(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConsoleRequestError("工具配置必须是 JSON 对象。", 400, "invalid_tool_configuration");
  }
  let serialized = "";
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ConsoleRequestError("工具配置无法序列化。", 400, "invalid_tool_configuration");
  }
  if (!serialized || serialized.length > 64_000) {
    throw new ConsoleRequestError("工具配置不能超过 64 KB。", 400, "invalid_tool_configuration");
  }
  return value as Record<string, unknown>;
}

function scopeFrom(input: InputRecord): { scope: PresetScope; organizationId: string | null } {
  const scope = input.scope === undefined ? "personal" : input.scope;
  if (scope !== "personal" && scope !== "organization") {
    throw new ConsoleRequestError("预设作用域无效。", 400, "invalid_preset_scope");
  }
  const organizationId = input.organizationId === undefined || input.organizationId === null || input.organizationId === ""
    ? null
    : typeof input.organizationId === "string"
      ? input.organizationId
      : (() => { throw new ConsoleRequestError("工作区标识无效。", 400, "invalid_organization_id"); })();
  if (scope === "organization" && !organizationId) {
    throw new ConsoleRequestError("工作区预设需要指定工作区。", 400, "organization_required");
  }
  if (scope === "personal" && organizationId) {
    throw new ConsoleRequestError("个人预设不能指定工作区。", 400, "invalid_preset_scope");
  }
  return { scope, organizationId };
}

function isDefaultFrom(value: unknown, fallback = false): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new ConsoleRequestError("默认值无效。", 400, "invalid_preset_default");
  return value;
}

export function parsePresetCreateInput(value: unknown): ParsedCreateInput {
  const input = objectInput(value);
  const kind = parsePresetKind(input.kind);
  const { scope, organizationId } = scopeFrom(input);
  const name = optionalString(input.name, "名称", 120);
  if (!name) throw new ConsoleRequestError("预设名称不能为空。", 400, "invalid_preset_name");
  const description = descriptionFrom(input.description) ?? null;
  const isDefault = isDefaultFrom(input.isDefault);
  if (kind === "personality") {
    const instructions = optionalString(input.instructions, "人格指令", 20_000);
    if (!instructions) throw new ConsoleRequestError("人格指令不能为空。", 400, "invalid_personality_instructions");
    return { kind, scope, organizationId, name, description, instructions, isDefault };
  }
  const toolConfiguration = configurationFrom(input.toolConfiguration);
  if (!toolConfiguration) throw new ConsoleRequestError("工具配置不能为空。", 400, "invalid_tool_configuration");
  return { kind, scope, organizationId, name, description, toolConfiguration, isDefault };
}

export function parsePresetUpdateInput(
  kind: ConsolePresetKind,
  value: unknown,
): UpdatePersonalityPresetInput | UpdateToolPresetInput {
  const input = objectInput(value);
  const name = optionalString(input.name, "名称", 120);
  if (name === "") throw new ConsoleRequestError("预设名称不能为空。", 400, "invalid_preset_name");
  const description = descriptionFrom(input.description);
  const isDefault = input.isDefault === undefined ? undefined : isDefaultFrom(input.isDefault);
  if (kind === "personality") {
    const instructions = optionalString(input.instructions, "人格指令", 20_000);
    if (instructions === "") throw new ConsoleRequestError("人格指令不能为空。", 400, "invalid_personality_instructions");
    if (name === undefined && description === undefined && instructions === undefined && isDefault === undefined) {
      throw new ConsoleRequestError("没有需要更新的内容。", 400, "empty_preset_update");
    }
    return { name, description, instructions, isDefault };
  }
  const toolConfiguration = configurationFrom(input.toolConfiguration);
  if (name === undefined && description === undefined && toolConfiguration === undefined && isDefault === undefined) {
    throw new ConsoleRequestError("没有需要更新的内容。", 400, "empty_preset_update");
  }
  return { name, description, toolConfiguration, isDefault };
}

function mapPersonality(record: PersonalityPresetRecord): ConsolePersonalityPreset {
  return {
    id: record.id,
    ownerUserId: record.ownerUserId,
    organizationId: record.organizationId,
    scope: record.scope,
    name: record.name,
    description: record.description,
    instructions: record.instructions,
    isDefault: record.isDefault,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapTool(record: ToolPresetRecord): ConsoleToolPreset {
  return {
    id: record.id,
    ownerUserId: record.ownerUserId,
    organizationId: record.organizationId,
    scope: record.scope,
    name: record.name,
    description: record.description,
    toolConfiguration: record.toolConfiguration,
    isDefault: record.isDefault,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function sortByDefaultAndUpdated<T extends { isDefault: boolean; updatedAt: string }>(records: T[]): T[] {
  return [...records].sort((left, right) => Number(right.isDefault) - Number(left.isDefault)
    || right.updatedAt.localeCompare(left.updatedAt));
}

async function ensurePresetWritable(
  context: ConsoleRequestContext,
  preset: PersonalityPresetRecord | ToolPresetRecord,
): Promise<void> {
  if (preset.scope === "personal") {
    if (preset.ownerUserId !== context.userId) {
      throw new ConsoleRequestError("未找到该预设。", 404, "preset_not_found");
    }
    return;
  }
  const selected = await requireConsoleOrganization(context, preset.organizationId);
  ensureOrganizationResourceManager(selected.membership.role);
}

export async function getConsolePresets(
  context: ConsoleRequestContext,
  organizationId?: string | null,
): Promise<ConsolePresets> {
  const activeOrganization = await findConsoleOrganization(context, organizationId);
  const activeOrganizationId = activeOrganization?.organization.id;
  const [organizations, personalPersonality, personalTools, organizationPersonality, organizationTools] = await Promise.all([
    listConsoleOrganizations(context),
    context.repositories.presets.listPersonalities(context.userId),
    context.repositories.presets.listTools(context.userId),
    activeOrganizationId
      ? context.repositories.presets.listPersonalities(context.userId, activeOrganizationId)
      : Promise.resolve([]),
    activeOrganizationId
      ? context.repositories.presets.listTools(context.userId, activeOrganizationId)
      : Promise.resolve([]),
  ]);
  return {
    organizations,
    activeOrganization: activeOrganization?.organization ?? null,
    canManageOrganizationPresets: Boolean(
      activeOrganization && (activeOrganization.membership.role === "owner" || activeOrganization.membership.role === "admin"),
    ),
    personalities: {
      personal: sortByDefaultAndUpdated(personalPersonality.map(mapPersonality)),
      organization: sortByDefaultAndUpdated(organizationPersonality.map(mapPersonality)),
    },
    tools: {
      personal: sortByDefaultAndUpdated(personalTools.map(mapTool)),
      organization: sortByDefaultAndUpdated(organizationTools.map(mapTool)),
    },
  };
}

export async function createConsolePreset(
  context: ConsoleRequestContext,
  value: unknown,
): Promise<{ kind: ConsolePresetKind; preset: ConsolePersonalityPreset | ConsoleToolPreset }> {
  const input = parsePresetCreateInput(value);
  if (input.scope === "organization") {
    const selected = await requireConsoleOrganization(context, input.organizationId);
    ensureOrganizationResourceManager(selected.membership.role);
  }
  if (input.kind === "personality") {
    const preset = await context.repositories.presets.createPersonality({
      ownerUserId: context.userId,
      organizationId: input.organizationId,
      scope: input.scope,
      name: input.name,
      description: input.description,
      instructions: input.instructions as string,
      isDefault: input.isDefault,
    });
    return { kind: input.kind, preset: mapPersonality(preset) };
  }
  const preset = await context.repositories.presets.createTool({
    ownerUserId: context.userId,
    organizationId: input.organizationId,
    scope: input.scope,
    name: input.name,
    description: input.description,
    toolConfiguration: input.toolConfiguration as Record<string, unknown>,
    isDefault: input.isDefault,
  });
  return { kind: input.kind, preset: mapTool(preset) };
}

async function resolvePreset(
  context: ConsoleRequestContext,
  kind: ConsolePresetKind,
  id: string,
): Promise<PersonalityPresetRecord | ToolPresetRecord> {
  const preset = kind === "personality"
    ? await context.repositories.presets.findPersonalityById(id)
    : await context.repositories.presets.findToolById(id);
  if (!preset) throw new ConsoleRequestError("未找到该预设。", 404, "preset_not_found");
  await ensurePresetWritable(context, preset);
  return preset;
}

export async function updateConsolePreset(
  context: ConsoleRequestContext,
  kind: ConsolePresetKind,
  id: string,
  value: unknown,
): Promise<ConsolePersonalityPreset | ConsoleToolPreset> {
  await resolvePreset(context, kind, id);
  const input = parsePresetUpdateInput(kind, value);
  if (kind === "personality") {
    const updateInput: UpdatePersonalityPresetInput = input.isDefault
      ? { ...input, isDefault: undefined } as UpdatePersonalityPresetInput
      : input as UpdatePersonalityPresetInput;
    const updated = await context.repositories.presets.updatePersonality(id, updateInput);
    if (!updated) throw new ConsoleRequestError("未找到该预设。", 404, "preset_not_found");
    if (input.isDefault) {
      const defaulted = await context.repositories.presets.setPersonalityDefault(id);
      if (!defaulted) throw new ConsoleRequestError("未找到该预设。", 404, "preset_not_found");
      return mapPersonality(defaulted);
    }
    return mapPersonality(updated);
  }
  const updateInput: UpdateToolPresetInput = input.isDefault
    ? { ...input, isDefault: undefined } as UpdateToolPresetInput
    : input as UpdateToolPresetInput;
  const updated = await context.repositories.presets.updateTool(id, updateInput);
  if (!updated) throw new ConsoleRequestError("未找到该预设。", 404, "preset_not_found");
  if (input.isDefault) {
    const defaulted = await context.repositories.presets.setToolDefault(id);
    if (!defaulted) throw new ConsoleRequestError("未找到该预设。", 404, "preset_not_found");
    return mapTool(defaulted);
  }
  return mapTool(updated);
}

export async function setConsolePresetDefault(
  context: ConsoleRequestContext,
  kind: ConsolePresetKind,
  id: string,
): Promise<ConsolePersonalityPreset | ConsoleToolPreset> {
  await resolvePreset(context, kind, id);
  if (kind === "personality") {
    const updated = await context.repositories.presets.setPersonalityDefault(id);
    if (!updated) throw new ConsoleRequestError("未找到该预设。", 404, "preset_not_found");
    return mapPersonality(updated);
  }
  const updated = await context.repositories.presets.setToolDefault(id);
  if (!updated) throw new ConsoleRequestError("未找到该预设。", 404, "preset_not_found");
  return mapTool(updated);
}

export async function deleteConsolePreset(
  context: ConsoleRequestContext,
  kind: ConsolePresetKind,
  id: string,
): Promise<void> {
  await resolvePreset(context, kind, id);
  const deleted = kind === "personality"
    ? await context.repositories.presets.deletePersonality(id)
    : await context.repositories.presets.deleteTool(id);
  if (!deleted) throw new ConsoleRequestError("未找到该预设。", 404, "preset_not_found");
}
