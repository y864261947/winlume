import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Skill } from "@/lib/agent/types";
import { DEPARTMENT_ORDER } from "./departments";
import { categoryForMasterSlug } from "./master-skill";
import { parseSkillMarkdown } from "./parse";

export type CatalogSkill = { skill: Skill; originPath: string };

const DEPARTMENT_SET = new Set<string>(DEPARTMENT_ORDER);

const AGENCY_SKIP = new Set([
  "readme",
  "readme.zh-tw",
  "catalog",
  "contributing",
  "agent-list",
  "upstream",
  "executive-brief",
  "quickstart",
  "pull_request_template",
  "license",
  "handoff-templates",
  "agent-activation-prompts",
  "nexus-strategy",
]);

function looksLikeAgencyDoc(stem: string): boolean {
  const id = stem.toLowerCase();
  if (AGENCY_SKIP.has(id)) return true;
  if (id.startsWith("phase-") || id.startsWith("scenario-")) return true;
  return false;
}

export function categoryFromSlug(slug: string, hint = ""): string {
  const hay = `${slug} ${hint}`.toLowerCase();
  if (DEPARTMENT_SET.has(slug)) return slug;
  if (/legal|law|compliance|policy/.test(hay)) return "legal";
  if (/finance|invoice|billing|invest|tax/.test(hay)) return "finance";
  if (/market|seo|ads|content|brand|copy|social|twitter|newsletter/.test(hay)) return "marketing";
  if (/design|ui|ux|brand-guidelines|canvas|theme|image/.test(hay)) return "design";
  if (/sale|lead|crm|outreach/.test(hay)) return "sales";
  if (/hr|resume|recruit|onboard/.test(hay)) return "hr";
  if (/test|qa|review/.test(hay)) return "testing";
  if (/security|audit|lint|accesslint/.test(hay)) return "security";
  if (/product|roadmap|discovery/.test(hay)) return "product";
  if (/code|dev|engineer|api|cloud|devops|frontend|backend|react|nextjs/.test(hay)) {
    return "engineering";
  }
  return categoryForMasterSlug(hay);
}

function toImportedSkill(parsed: Skill, id: string, fallbackCategory: string): Skill {
  const name = parsed.name && parsed.name.length <= 80 ? parsed.name : id;
  return {
    ...parsed,
    id,
    name,
    description: parsed.description || name,
    category:
      parsed.category && parsed.category !== "general"
        ? parsed.category
        : fallbackCategory,
    source: "imported",
    enabled: true,
    featured: false,
    examplePrompt: parsed.examplePrompt,
  };
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function readAgencyAgentsZh(rootDir: string): Promise<CatalogSkill[]> {
  const out: CatalogSkill[] = [];
  let entries: string[] = [];
  try {
    entries = await readdir(rootDir);
  } catch {
    return [];
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    if (["integrations", "scripts", "examples", "assets", ".github"].includes(name)) continue;
    const dir = join(rootDir, name);
    if (!(await isDir(dir))) continue;
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;
      const stem = file.replace(/\.md$/i, "");
      if (looksLikeAgencyDoc(stem)) continue;
      const path = join(dir, file);
      const markdown = await readFile(path, "utf8");
      const parsed = parseSkillMarkdown(markdown, { fallbackId: stem });
      const category = DEPARTMENT_SET.has(name) ? name : categoryFromSlug(stem, parsed.description);
      out.push({
        skill: toImportedSkill({ ...parsed, id: stem }, stem, category),
        originPath: relative(rootDir, path),
      });
    }
  }
  return out.sort((a, b) => a.skill.id.localeCompare(b.skill.id));
}

const COMPOSIO_SKIP = new Set([
  "template-skill",
  "connect",
  "connect-apps",
  "skill-creator",
  "skill-share",
]);

export async function readAwesomeClaudeSkills(rootDir: string): Promise<CatalogSkill[]> {
  const out: CatalogSkill[] = [];
  let entries: string[] = [];
  try {
    entries = await readdir(rootDir);
  } catch {
    return [];
  }
  for (const name of entries) {
    if (name.startsWith(".") || name === "composio-skills" || COMPOSIO_SKIP.has(name)) continue;
    const skillFile = join(rootDir, name, "SKILL.md");
    let markdown: string;
    try {
      markdown = await readFile(skillFile, "utf8");
    } catch {
      continue;
    }
    const parsed = parseSkillMarkdown(markdown, { fallbackId: name });
    out.push({
      skill: toImportedSkill(parsed, `claude-${name}`, categoryFromSlug(name, parsed.description)),
      originPath: `${name}/SKILL.md`,
    });
  }
  return out.sort((a, b) => a.skill.id.localeCompare(b.skill.id));
}

const AGENTIC_SKIP_NAME = /-(py|ts|js|tsx|jsx|go|rs|rust|dotnet|java|rb|php)$|^(azure-|aws-sdk|m365-|hosted-agents-v2|template)/i;

export async function readAgenticAwesomeSkills(rootDir: string): Promise<CatalogSkill[]> {
  const skillsDir = join(rootDir, "skills");
  let entries: string[] = [];
  try {
    entries = await readdir(skillsDir);
  } catch {
    return [];
  }
  const out: CatalogSkill[] = [];
  for (const name of entries) {
    if (name.startsWith(".") || AGENTIC_SKIP_NAME.test(name)) continue;
    const skillFile = join(skillsDir, name, "SKILL.md");
    let markdown: string;
    try {
      markdown = await readFile(skillFile, "utf8");
    } catch {
      continue;
    }
    const parsed = parseSkillMarkdown(markdown, { fallbackId: name });
    if (/^risk:\s*offensive/m.test(markdown.slice(0, 800))) continue;
    if ((parsed.systemPrompt ?? "").trim().length < 1200) continue;
    out.push({
      skill: toImportedSkill(parsed, `aas-${name}`, categoryFromSlug(name, parsed.description)),
      originPath: `skills/${name}/SKILL.md`,
    });
  }
  return out.sort((a, b) => a.skill.id.localeCompare(b.skill.id));
}

export const OPEN_CATALOGS = [
  {
    id: "agency-agents-zh",
    label: "agency-agents-zh",
    repo: "https://github.com/jnMetaCode/agency-agents-zh.git",
    marker: "AGENT-LIST.md",
    defaultDir: "/tmp/agency-agents-zh",
    skipExistingIds: true,
    read: readAgencyAgentsZh,
  },
  {
    id: "awesome-claude-skills",
    label: "awesome-claude-skills",
    repo: "https://github.com/ComposioHQ/awesome-claude-skills.git",
    marker: "content-research-writer/SKILL.md",
    defaultDir: "/tmp/awesome-claude-skills",
    skipExistingIds: false,
    read: readAwesomeClaudeSkills,
  },
  {
    id: "agentic-awesome-skills",
    label: "agentic-awesome-skills",
    repo: "https://github.com/sickn33/agentic-awesome-skills.git",
    marker: "skills",
    defaultDir: "/tmp/agentic-awesome-skills",
    skipExistingIds: false,
    read: readAgenticAwesomeSkills,
  },
] as const;

export type OpenCatalogId = (typeof OPEN_CATALOGS)[number]["id"];
