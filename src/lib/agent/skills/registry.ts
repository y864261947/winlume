import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Skill, SkillMeta } from "@/lib/agent/types";
import { getWorkScene, skillsForScene } from "@/lib/studio/work-scenes";
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

async function loadAllSkills(force = false): Promise<Skill[]> {
  const now = Date.now();
  if (!force && cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.skills;
  }

  const root = skillsRootDir();
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      cache = { skills: [], loadedAt: now };
      return [];
    }
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
      if (skill.enabled !== false) {
        skills.push(skill);
      }
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

  cache = { skills, loadedAt: now };
  return skills;
}

/** List all enabled bundled skills (full Skill objects). */
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
  const skills = await loadAllSkills();
  return skills.find((s) => s.id === id) ?? null;
}

/**
 * Filter helpers for API / UI.
 */
export async function listSkillsFiltered(opts: {
  q?: string;
  category?: string;
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
