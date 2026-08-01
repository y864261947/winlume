import { and, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { PlatformDatabase } from "../db/client";
import { personalityPresets, toolPresets } from "../db/schema";
import type { PresetScope } from "../types";

export type PersonalityPresetRecord = InferSelectModel<typeof personalityPresets>;
export type ToolPresetRecord = InferSelectModel<typeof toolPresets>;

export interface CreatePersonalityPresetInput {
  ownerUserId: string;
  organizationId?: string | null;
  scope?: PresetScope;
  name: string;
  description?: string | null;
  instructions: string;
  isDefault?: boolean;
}

export interface CreateToolPresetInput {
  ownerUserId: string;
  organizationId?: string | null;
  scope?: PresetScope;
  name: string;
  description?: string | null;
  toolConfiguration: Record<string, unknown>;
  isDefault?: boolean;
}

export interface UpdatePersonalityPresetInput {
  name?: string;
  description?: string | null;
  instructions?: string;
  isDefault?: boolean;
}

export interface UpdateToolPresetInput {
  name?: string;
  description?: string | null;
  toolConfiguration?: Record<string, unknown>;
  isDefault?: boolean;
}

function resolveScope(organizationId: string | null | undefined, scope: PresetScope | undefined): PresetScope {
  const resolved = scope ?? (organizationId ? "organization" : "personal");
  if ((resolved === "organization") !== Boolean(organizationId)) {
    throw new Error("Organization presets require an organization ID; personal presets must not have one.");
  }
  return resolved;
}

export class PresetRepository {
  constructor(private readonly database: PlatformDatabase) {}

  async createPersonality(input: CreatePersonalityPresetInput): Promise<PersonalityPresetRecord> {
    const name = input.name.trim();
    const instructions = input.instructions.trim();
    if (!name || !instructions) throw new Error("Preset name and instructions are required.");
    const organizationId = input.organizationId ?? null;
    const scope = resolveScope(organizationId, input.scope);
    const values = {
      ownerUserId: input.ownerUserId,
      organizationId,
      scope,
      name,
      description: input.description?.trim() || null,
      instructions,
      isDefault: input.isDefault ?? false,
    } as const;
    if (!values.isDefault) {
      const [preset] = await this.database.insert(personalityPresets).values(values).returning();
      if (!preset) throw new Error("Failed to create personality preset.");
      return preset;
    }
    return this.database.transaction(async (tx) => {
      const defaultScope = scope === "organization"
        ? and(eq(personalityPresets.organizationId, organizationId as string), eq(personalityPresets.scope, "organization"))
        : and(eq(personalityPresets.ownerUserId, input.ownerUserId), eq(personalityPresets.scope, "personal"));
      await tx.update(personalityPresets).set({ isDefault: false, updatedAt: new Date() }).where(defaultScope);
      const [preset] = await tx.insert(personalityPresets).values(values).returning();
      if (!preset) throw new Error("Failed to create personality preset.");
      return preset;
    });
  }

  async createTool(input: CreateToolPresetInput): Promise<ToolPresetRecord> {
    const name = input.name.trim();
    if (!name) throw new Error("A preset name is required.");
    const organizationId = input.organizationId ?? null;
    const scope = resolveScope(organizationId, input.scope);
    const values = {
      ownerUserId: input.ownerUserId,
      organizationId,
      scope,
      name,
      description: input.description?.trim() || null,
      toolConfiguration: input.toolConfiguration,
      isDefault: input.isDefault ?? false,
    } as const;
    if (!values.isDefault) {
      const [preset] = await this.database.insert(toolPresets).values(values).returning();
      if (!preset) throw new Error("Failed to create tool preset.");
      return preset;
    }
    return this.database.transaction(async (tx) => {
      const defaultScope = scope === "organization"
        ? and(eq(toolPresets.organizationId, organizationId as string), eq(toolPresets.scope, "organization"))
        : and(eq(toolPresets.ownerUserId, input.ownerUserId), eq(toolPresets.scope, "personal"));
      await tx.update(toolPresets).set({ isDefault: false, updatedAt: new Date() }).where(defaultScope);
      const [preset] = await tx.insert(toolPresets).values(values).returning();
      if (!preset) throw new Error("Failed to create tool preset.");
      return preset;
    });
  }

  async listPersonalities(ownerUserId: string, organizationId?: string): Promise<PersonalityPresetRecord[]> {
    const condition = organizationId
      ? and(eq(personalityPresets.organizationId, organizationId), eq(personalityPresets.scope, "organization"))
      : and(eq(personalityPresets.ownerUserId, ownerUserId), eq(personalityPresets.scope, "personal"));
    return this.database.select().from(personalityPresets).where(condition);
  }

  async listTools(ownerUserId: string, organizationId?: string): Promise<ToolPresetRecord[]> {
    const condition = organizationId
      ? and(eq(toolPresets.organizationId, organizationId), eq(toolPresets.scope, "organization"))
      : and(eq(toolPresets.ownerUserId, ownerUserId), eq(toolPresets.scope, "personal"));
    return this.database.select().from(toolPresets).where(condition);
  }

  async findPersonalityById(id: string): Promise<PersonalityPresetRecord | null> {
    const [preset] = await this.database.select().from(personalityPresets).where(eq(personalityPresets.id, id)).limit(1);
    return preset ?? null;
  }

  async findToolById(id: string): Promise<ToolPresetRecord | null> {
    const [preset] = await this.database.select().from(toolPresets).where(eq(toolPresets.id, id)).limit(1);
    return preset ?? null;
  }

  async updatePersonality(id: string, input: UpdatePersonalityPresetInput): Promise<PersonalityPresetRecord | null> {
    const values: UpdatePersonalityPresetInput & { updatedAt: Date } = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error("A preset name is required.");
      values.name = name;
    }
    if (input.description !== undefined) values.description = input.description?.trim() || null;
    if (input.instructions !== undefined) {
      const instructions = input.instructions.trim();
      if (!instructions) throw new Error("Preset instructions are required.");
      values.instructions = instructions;
    }
    if (input.isDefault !== undefined) values.isDefault = input.isDefault;
    const [preset] = await this.database
      .update(personalityPresets)
      .set(values)
      .where(eq(personalityPresets.id, id))
      .returning();
    return preset ?? null;
  }

  async updateTool(id: string, input: UpdateToolPresetInput): Promise<ToolPresetRecord | null> {
    const values: UpdateToolPresetInput & { updatedAt: Date } = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new Error("A preset name is required.");
      values.name = name;
    }
    if (input.description !== undefined) values.description = input.description?.trim() || null;
    if (input.toolConfiguration !== undefined) values.toolConfiguration = input.toolConfiguration;
    if (input.isDefault !== undefined) values.isDefault = input.isDefault;
    const [preset] = await this.database
      .update(toolPresets)
      .set(values)
      .where(eq(toolPresets.id, id))
      .returning();
    return preset ?? null;
  }

  async setPersonalityDefault(id: string): Promise<PersonalityPresetRecord | null> {
    const preset = await this.findPersonalityById(id);
    if (!preset) return null;
    return this.database.transaction(async (tx) => {
      const defaultScope = preset.scope === "organization"
        ? and(eq(personalityPresets.organizationId, preset.organizationId as string), eq(personalityPresets.scope, "organization"))
        : and(eq(personalityPresets.ownerUserId, preset.ownerUserId), eq(personalityPresets.scope, "personal"));
      await tx.update(personalityPresets).set({ isDefault: false, updatedAt: new Date() }).where(defaultScope);
      const [updated] = await tx
        .update(personalityPresets)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(personalityPresets.id, id))
        .returning();
      return updated ?? null;
    });
  }

  async setToolDefault(id: string): Promise<ToolPresetRecord | null> {
    const preset = await this.findToolById(id);
    if (!preset) return null;
    return this.database.transaction(async (tx) => {
      const defaultScope = preset.scope === "organization"
        ? and(eq(toolPresets.organizationId, preset.organizationId as string), eq(toolPresets.scope, "organization"))
        : and(eq(toolPresets.ownerUserId, preset.ownerUserId), eq(toolPresets.scope, "personal"));
      await tx.update(toolPresets).set({ isDefault: false, updatedAt: new Date() }).where(defaultScope);
      const [updated] = await tx
        .update(toolPresets)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(toolPresets.id, id))
        .returning();
      return updated ?? null;
    });
  }

  async deletePersonality(id: string): Promise<boolean> {
    const deleted = await this.database
      .delete(personalityPresets)
      .where(eq(personalityPresets.id, id))
      .returning({ id: personalityPresets.id });
    return deleted.length === 1;
  }

  async deleteTool(id: string): Promise<boolean> {
    const deleted = await this.database
      .delete(toolPresets)
      .where(eq(toolPresets.id, id))
      .returning({ id: toolPresets.id });
    return deleted.length === 1;
  }
}
