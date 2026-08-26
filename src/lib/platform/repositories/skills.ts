import { and, count, eq, ilike, or, sql } from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { Skill, SkillMeta } from "@/lib/agent/types";
import { skillhubIconUrl } from "@/lib/agent/skills/skillhub-icons";
import type { PlatformDatabase } from "../db/client";
import { studioSkills } from "../db/schema";

export type StudioSkillRecord = InferSelectModel<typeof studioSkills>;
export type StudioSkillInsert = InferInsertModel<typeof studioSkills>;

export type SkillListFilter = {
  q?: string;
  source?: Skill["source"];
  enabled?: boolean;
  featured?: boolean;
  category?: string;
  origin?: string;
};

export type SkillListPage = {
  rows: StudioSkillRecord[];
  promptChars: number[];
  total: number;
};

export function recordToSkill(record: StudioSkillRecord): Skill {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    category: record.category,
    triggers: record.triggers.length ? record.triggers : undefined,
    examplePrompt: record.examplePrompt ?? undefined,
    preview:
      record.preview === "markdown" || record.preview === "html" || record.preview === "none"
        ? record.preview
        : undefined,
    source: record.source,
    enabled: record.enabled,
    featured: record.featured,
    iconUrl: skillhubIconUrl(record.id),
    defaultArtifact:
      record.defaultArtifact === "markdown" ||
      record.defaultArtifact === "html" ||
      record.defaultArtifact === "image-prompt" ||
      record.defaultArtifact === "none"
        ? record.defaultArtifact
        : undefined,
    systemPrompt: record.systemPrompt,
  };
}

export function recordToSkillMeta(record: StudioSkillRecord): SkillMeta & { promptChars: number } {
  const skill = recordToSkill(record);
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    triggers: skill.triggers,
    examplePrompt: skill.examplePrompt,
    preview: skill.preview,
    source: skill.source,
    enabled: skill.enabled,
    featured: skill.featured,
    defaultArtifact: skill.defaultArtifact,
    promptChars: record.systemPrompt.length,
  };
}

function sanitizeText(value: string): string {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n");
}

function clip(value: string, max: number): string {
  const text = sanitizeText(value).trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function skillToInsert(skill: Skill, extra?: Pick<StudioSkillInsert, "origin" | "originPath">): StudioSkillInsert {
  return {
    id: clip(skill.id, 120),
    name: clip(skill.name || skill.id, 160),
    description: sanitizeText(skill.description ?? ""),
    category: skill.category || "general",
    triggers: skill.triggers ? [...skill.triggers] : [],
    examplePrompt: skill.examplePrompt ? sanitizeText(skill.examplePrompt) : null,
    preview: skill.preview ?? null,
    source: skill.source,
    enabled: skill.enabled !== false,
    featured: skill.featured === true,
    defaultArtifact: skill.defaultArtifact ?? null,
    systemPrompt: sanitizeText(skill.systemPrompt ?? ""),
    origin: extra?.origin ?? null,
    originPath: extra?.originPath ?? null,
    updatedAt: new Date(),
  };
}

export class SkillRepository {
  constructor(private readonly database: PlatformDatabase) {}

  async count(): Promise<number> {
    const [row] = await this.database.select({ value: count() }).from(studioSkills);
    return Number(row?.value ?? 0);
  }

  async findById(id: string): Promise<StudioSkillRecord | null> {
    const [row] = await this.database.select().from(studioSkills).where(eq(studioSkills.id, id)).limit(1);
    return row ?? null;
  }

  async listImportedLabels(): Promise<Array<{ id: string; name: string; description: string }>> {
    return this.database
      .select({
        id: studioSkills.id,
        name: studioSkills.name,
        description: studioSkills.description,
      })
      .from(studioSkills)
      .where(eq(studioSkills.source, "imported"));
  }

  async listIds(): Promise<string[]> {
    const rows = await this.database.select({ id: studioSkills.id }).from(studioSkills);
    return rows.map((row) => row.id);
  }

  private listConditions(filter: SkillListFilter) {
    const conditions = [];
    const q = filter.q?.trim();
    if (q) {
      const pattern = `%${q}%`;
      conditions.push(
        or(
          ilike(studioSkills.id, pattern),
          ilike(studioSkills.name, pattern),
          ilike(studioSkills.description, pattern),
          ilike(studioSkills.category, pattern),
        ),
      );
    }
    if (filter.source) conditions.push(eq(studioSkills.source, filter.source));
    if (typeof filter.enabled === "boolean") conditions.push(eq(studioSkills.enabled, filter.enabled));
    if (typeof filter.featured === "boolean") conditions.push(eq(studioSkills.featured, filter.featured));
    if (filter.category && filter.category !== "all") {
      conditions.push(eq(studioSkills.category, filter.category));
    }
    if (filter.origin) conditions.push(eq(studioSkills.origin, filter.origin));
    return conditions;
  }

  async list(filter: SkillListFilter = {}): Promise<StudioSkillRecord[]> {
    const conditions = this.listConditions(filter);
    const query = this.database.select().from(studioSkills);
    const rows = conditions.length
      ? await query.where(and(...conditions)).orderBy(studioSkills.category, studioSkills.name)
      : await query.orderBy(studioSkills.category, studioSkills.name);
    return rows;
  }

  async listPage(
    filter: SkillListFilter = {},
    paging: { limit: number; offset: number } = { limit: 40, offset: 0 },
  ): Promise<SkillListPage> {
    const conditions = this.listConditions(filter);
    const where = conditions.length ? and(...conditions) : undefined;
    const limit = Math.min(Math.max(paging.limit, 1), 80);
    const offset = Math.max(paging.offset, 0);
    const [totalRow] = await this.database
      .select({ value: count() })
      .from(studioSkills)
      .where(where);
    const rows = await this.database
      .select({
        id: studioSkills.id,
        name: studioSkills.name,
        description: studioSkills.description,
        category: studioSkills.category,
        triggers: studioSkills.triggers,
        examplePrompt: studioSkills.examplePrompt,
        preview: studioSkills.preview,
        source: studioSkills.source,
        enabled: studioSkills.enabled,
        featured: studioSkills.featured,
        defaultArtifact: studioSkills.defaultArtifact,
        origin: studioSkills.origin,
        originPath: studioSkills.originPath,
        createdAt: studioSkills.createdAt,
        updatedAt: studioSkills.updatedAt,
        systemPrompt: sql<string>`''`.as("system_prompt"),
        promptChars: sql<number>`char_length(${studioSkills.systemPrompt})`.as("prompt_chars"),
      })
      .from(studioSkills)
      .where(where)
      .orderBy(studioSkills.category, studioSkills.name, studioSkills.id)
      .limit(limit)
      .offset(offset);
    return {
      total: Number(totalRow?.value ?? 0),
      promptChars: rows.map((row) => Number(row.promptChars ?? 0)),
      rows: rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        triggers: row.triggers,
        examplePrompt: row.examplePrompt,
        preview: row.preview,
        source: row.source,
        enabled: row.enabled,
        featured: row.featured,
        defaultArtifact: row.defaultArtifact,
        systemPrompt: "",
        origin: row.origin,
        originPath: row.originPath,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async upsertMany(rows: StudioSkillInsert[]): Promise<number> {
    if (!rows.length) return 0;
    let written = 0;
    for (const row of rows) {
      try {
        await this.database
          .insert(studioSkills)
          .values(row)
          .onConflictDoUpdate({
            target: studioSkills.id,
            set: {
              name: sql`excluded.name`,
              description: sql`excluded.description`,
              category: sql`excluded.category`,
              triggers: sql`excluded.triggers`,
              examplePrompt: sql`excluded.example_prompt`,
              preview: sql`excluded.preview`,
              source: sql`excluded.source`,
              defaultArtifact: sql`excluded.default_artifact`,
              systemPrompt: sql`excluded.system_prompt`,
              origin: sql`excluded.origin`,
              originPath: sql`excluded.origin_path`,
              updatedAt: sql`now()`,
            },
          });
        written += 1;
      } catch (error) {
        console.warn("[skills] skip", row.id, error instanceof Error ? error.message : error);
      }
    }
    return written;
  }

  async update(
    id: string,
    patch: Partial<
      Pick<
        StudioSkillInsert,
        | "name"
        | "description"
        | "category"
        | "triggers"
        | "examplePrompt"
        | "enabled"
        | "featured"
        | "systemPrompt"
        | "preview"
      >
    >,
  ): Promise<StudioSkillRecord | null> {
    const [row] = await this.database
      .update(studioSkills)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(studioSkills.id, id))
      .returning();
    return row ?? null;
  }
}
