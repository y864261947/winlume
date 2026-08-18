import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Skill, SkillMeta } from "@/lib/agent/types";
import { getPlatformRepositories } from "@/lib/platform/repositories";
import { recordToSkill, skillToInsert } from "@/lib/platform/repositories/skills";
import { getWorkScene, skillsForScene } from "@/lib/studio/work-scenes";
import {
  isStudioToolCategoryId,
  skillDepartmentToToolCategory,
} from "@/lib/studio/tool-categories";
import { parseSkillContract, toSkillContractMeta } from "./contracts";
import { departmentLabel, sortDepartmentIds } from "./departments";
import { parseSkillMarkdown, toSkillMeta } from "./parse";

let cache: { skills: Skill[]; loadedAt: number } | null = null;
const CACHE_TTL_MS = 5_000;

export function skillsRootDir(): string {
  if (process.env.REIZO_SKILLS_DIR?.trim()) {
    return process.env.REIZO_SKILLS_DIR.trim();
  }
  // Statically scoped under content/ so bundler NFT does not trace the whole repo
  return join(/* turbopackIgnore: true */ process.cwd(), "content", "skills");
}

/** Invalidate in-process cache (tests / hot reload). */
export function clearSkillsCache(): void {
  cache = null;
}

async function readOptionalUtf8(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function preferFilesystemStore(): boolean {
  return Boolean(process.env.REIZO_SKILLS_DIR?.trim());
}

export async function scanFilesystemSkills(): Promise<Skill[]> {
  const root = skillsRootDir();
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }

  const skills: Skill[] = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const dir = join(root, name);
    let isDir = false;
    try {
      isDir = (await stat(dir)).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    const skillFile = join(dir, "SKILL.md");
    const contractFile = join(dir, "skill.json");
    let raw: string;
    try {
      raw = await readFile(skillFile, "utf8");
    } catch {
      continue;
    }

    try {
      const skill = parseSkillMarkdown(raw, { fallbackId: name });
      // Directory name is canonical id for filesystem layout
      skill.id = name;
      const rawContract = await readOptionalUtf8(contractFile);
      if (rawContract !== null) {
        skill.contract = toSkillContractMeta(
          parseSkillContract(rawContract, name),
        );
      }
      skills.push(skill);
    } catch (err) {
      if ((err as Error).message?.startsWith("Skill contract")) {
        console.warn("[skills] invalid v2 Skill package skipped:", dir);
        continue;
      }
      console.warn(`[skills] failed to parse ${skillFile}:`, err);
    }
  }

  skills.sort((a, b) => {
    const cat = a.category.localeCompare(b.category, "zh");
    if (cat !== 0) return cat;
    return a.name.localeCompare(b.name, "zh");
  });

  return skills;
}

export async function seedBundledSkills(): Promise<number> {
  const repositories = getPlatformRepositories();
  if (!repositories) throw new Error("平台数据库尚未配置。");
  const scanned = await scanFilesystemSkills();
  return repositories.skills.upsertMany(
    scanned.map((skill) =>
      skillToInsert(
        { ...skill, source: "bundled" },
        { origin: "filesystem", originPath: skill.id },
      ),
    ),
  );
}

async function loadAllSkills(force = false): Promise<Skill[]> {
  const now = Date.now();
  if (!force && cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.skills;
  }

  let skills: Skill[] = [];
  if (!preferFilesystemStore()) {
    const repositories = getPlatformRepositories();
    if (repositories) {
      try {
        if ((await repositories.skills.count()) === 0) {
          await seedBundledSkills();
        }
        const rows = await repositories.skills.list({ enabled: true });
        skills = rows.map(recordToSkill);
      } catch (error) {
        console.warn("[skills] database catalog unavailable, falling back to files:", error);
        skills = (await scanFilesystemSkills()).filter((skill) => skill.enabled !== false);
      }
    } else {
      skills = (await scanFilesystemSkills()).filter((skill) => skill.enabled !== false);
    }
  } else {
    skills = (await scanFilesystemSkills()).filter((skill) => skill.enabled !== false);
  }

  cache = { skills, loadedAt: now };
  return skills;
}

/** List all enabled skills (full Skill objects). */
export async function listSkills(): Promise<Skill[]> {
  return loadAllSkills();
}

/** List metadata only (no systemPrompt). */
export async function listSkillMetas(): Promise<SkillMeta[]> {
  const skills = await loadAllSkills();
  return skills.map(toSkillMeta);
}

/** Get one skill by id, or null. */
export async function getSkill(id: string): Promise<Skill | null> {
  if (!id || id.includes("/") || id.includes("\\") || id === "." || id === "..") {
    return null;
  }
  if (!preferFilesystemStore()) {
    const repositories = getPlatformRepositories();
    if (repositories) {
      try {
        const row = await repositories.skills.findById(id);
        if (row) return row.enabled === false ? null : recordToSkill(row);
      } catch {
        // Fall through to the filesystem catalog.
      }
    }
  }
  const skills = await loadAllSkills();
  return skills.find((s) => s.id === id) ?? null;
}

/**
 * Filter helpers for API / UI.
 */
export async function listSkillsFiltered(opts: {
  q?: string;
  category?: string;
  catalog?: string;
  featured?: boolean;
  scene?: string;
}): Promise<SkillMeta[]> {
  let skills = await listSkillMetas();
  const scene = getWorkScene(opts.scene);
  if (scene) {
    const allowedSkillIds = new Set(skillsForScene(scene.id));
    skills = skills.filter((skill) => allowedSkillIds.has(skill.id));
  }
  const category = opts.category?.trim();
  if (category && category !== "all") {
    skills = skills.filter((s) => s.category === category);
  }
  const catalog = opts.catalog?.trim();
  if (catalog && catalog !== "all" && isStudioToolCategoryId(catalog)) {
    skills = skills.filter(
      (skill) => skillDepartmentToToolCategory(skill.category) === catalog,
    );
  }
  if (opts.featured === true) {
    skills = skills.filter((s) => s.featured === true);
  }
  const q = opts.q?.trim().toLowerCase();
  if (q) {
    skills = skills.filter((s) => {
      const hay = [
        s.id,
        s.name,
        s.description,
        s.category,
        ...(s.triggers ?? []),
      ]
        .join("\n")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  return skills;
}

export async function listDepartments(): Promise<
  { id: string; label: string; count: number }[]
> {
  const skills = await listSkillMetas();
  const counts = new Map<string, number>();
  for (const s of skills) {
    counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  }
  return sortDepartmentIds([...counts.keys()]).map((id) => ({
    id,
    label: departmentLabel(id),
    count: counts.get(id) ?? 0,
  }));
}
