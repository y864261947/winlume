import type { Skill } from "@/lib/agent/types";
import { getPlatformRepositories } from "@/lib/platform/repositories";
import { skillToInsert } from "@/lib/platform/repositories/skills";
import { clearSkillsCache } from "./registry";

/**
 * SkillHub (skillhub.cn) is a third-party skill marketplace, not a git repo,
 * so it can't reuse the `OPEN_CATALOGS` git-clone importer shape — it has its
 * own public JSON API we call directly.
 */

const API_BASE = "https://api.skillhub.cn/api";
const SCRIPT_RE = /\.(py|sh|js|ts|rb|ps1|bat)$/i;
const EXTRA_BUDGET = 12_000;

// Our department id -> SkillHub category keys. Department ids are the
// existing 19-value vocabulary in departments.ts; skillDepartmentToToolCategory()
// in tool-categories.ts already rolls these up into the 8-category workbench,
// so SkillHub imports slot into the existing rollup with no new category ids.
const SKILLHUB_SOURCE_MAP: Record<string, string[]> = {
  marketing: ["content-creation"],
  design: ["design-media"],
  sales: ["business-ops"],
  finance: ["professional"],
  product: ["ai-agent", "knowledge-management"],
  "project-management": ["office-efficiency"],
  academic: ["data-analysis", "education"],
  engineering: ["dev-programming", "it-ops-security"],
};

type SkillHubListItem = {
  slug: string;
  name: string;
  description?: string;
  description_zh?: string;
  version: string;
  score?: number;
  downloads?: number;
  ownerName?: string;
  iconUrl?: string;
  namespace: { handle: string };
};

type SkillHubFile = { path: string; size: number };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function fetchCandidates(category: string, pageSize: number): Promise<SkillHubListItem[]> {
  const url = `${API_BASE}/skills?page=1&pageSize=${pageSize}&category=${category}&sortBy=score`;
  const data = await getJson<{ data?: { skills?: SkillHubListItem[] } }>(url);
  return data.data?.skills ?? [];
}

async function fileList(slug: string, namespace: string, version: string): Promise<SkillHubFile[]> {
  const url = `${API_BASE}/v1/skills/${slug}/files?version=${encodeURIComponent(version)}&namespace=${encodeURIComponent(namespace)}`;
  const data = await getJson<{ files?: SkillHubFile[] }>(url);
  return data.files ?? [];
}

async function fetchFile(slug: string, namespace: string, version: string, path: string): Promise<string> {
  const url = `${API_BASE}/v1/skills/${slug}/file?path=${encodeURIComponent(path)}&version=${encodeURIComponent(version)}&namespace=${encodeURIComponent(namespace)}`;
  return getText(url);
}

function stripFrontmatter(md: string): string {
  if (!md.startsWith("---")) return md.trim();
  const closeIdx = md.indexOf("\n---", 3);
  if (closeIdx === -1) return md.trim();
  const afterClose = md.indexOf("\n", closeIdx + 1);
  return md.slice(afterClose === -1 ? closeIdx + 4 : afterClose + 1).trim();
}

function firstParagraph(body: string, fallback: string): string {
  const para = body
    .split(/[\r\n]{2,}/)
    .map((p) => p.replace(/^#+\s.*$/gm, "").replace(/[\r\n]+/g, " ").trim())
    .find((p) => p.length > 10);
  return (para || fallback).slice(0, 200);
}

export type SkillHubImportResult = {
  imported: number;
  skipped: Array<{ slug: string; reason: string }>;
};

/**
 * Import a curated, per-department batch of "knowledge-type" SkillHub
 * skills. Deliberately excludes anything script/hook-heavy: this app's
 * Studio runtime injects a Skill's markdown as a plain system-prompt blob
 * (see runAgentTurn) — it never executes a skill's bundled files — so a
 * skill whose real capability lives in a Python/JS script (chart rendering,
 * scraping) would just be dead weight or, worse, produce hallucinated
 * output for something the user expects to be exact.
 */
export async function importSkillHub(perDepartment = 15): Promise<SkillHubImportResult> {
  const repositories = getPlatformRepositories();
  if (!repositories) throw new Error("平台数据库尚未配置。");

  const skipped: Array<{ slug: string; reason: string }> = [];
  const rows: ReturnType<typeof skillToInsert>[] = [];

  for (const [department, shCategories] of Object.entries(SKILLHUB_SOURCE_MAP)) {
    let pool: SkillHubListItem[] = [];
    const seen = new Set<string>();
    for (const shCat of shCategories) {
      try {
        const candidates = await fetchCandidates(shCat, 40);
        for (const c of candidates) {
          if (seen.has(c.slug)) continue;
          seen.add(c.slug);
          pool.push(c);
        }
      } catch (e) {
        skipped.push({ slug: `(list:${shCat})`, reason: e instanceof Error ? e.message : String(e) });
      }
    }

    // Cap picks per publisher so one vendor spamming lookalike skills
    // (observed: a single 招投标/bid-data vendor placed ~5 near-duplicate
    // skills in the top-scored results of unrelated categories) can't
    // crowd out topical diversity within a department.
    const ownerCounts = new Map<string, number>();
    let importedForDept = 0;

    for (const item of pool) {
      if (importedForDept >= perDepartment) break;
      const owner = item.ownerName || item.namespace?.handle || "unknown";
      if ((ownerCounts.get(owner) ?? 0) >= 2) {
        skipped.push({ slug: item.slug, reason: `owner cap (${owner})` });
        continue;
      }

      const namespace = item.namespace.handle;
      let files: SkillHubFile[];
      try {
        files = await fileList(item.slug, namespace, item.version);
      } catch (e) {
        skipped.push({ slug: item.slug, reason: `files fetch failed: ${e instanceof Error ? e.message : e}` });
        continue;
      }
      const scriptFiles = files.filter((f) => SCRIPT_RE.test(f.path));
      const ratio = files.length ? scriptFiles.length / files.length : 0;
      if (scriptFiles.length >= 5 || ratio > 0.3) {
        skipped.push({ slug: item.slug, reason: `script-heavy (${scriptFiles.length}/${files.length})` });
        continue;
      }

      let skillMd: string;
      try {
        skillMd = await fetchFile(item.slug, namespace, item.version, "SKILL.md");
      } catch (e) {
        skipped.push({ slug: item.slug, reason: `SKILL.md fetch failed: ${e instanceof Error ? e.message : e}` });
        continue;
      }
      const body = stripFrontmatter(skillMd);
      const rawDescription = (item.description_zh || item.description || "").trim();
      const description =
        !rawDescription || rawDescription === "-" ? firstParagraph(body, item.name) : rawDescription;

      const mdRefs = files
        .filter((f) => /\.(md|txt)$/i.test(f.path) && f.path !== "SKILL.md" && f.size < 20000)
        .sort((a, b) => a.size - b.size);
      let extra = "";
      for (const f of mdRefs) {
        if (extra.length >= EXTRA_BUDGET) break;
        try {
          const content = await fetchFile(item.slug, namespace, item.version, f.path);
          extra += `\n\n---\n### 参考文件: ${f.path}\n\n${content.trim()}\n`;
        } catch {
          // best-effort; skip unreadable file
        }
      }

      const id = `skillhub-${item.slug}`.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
      const attribution = `> 来源：SkillHub（https://skillhub.cn/skills/${namespace}/${item.slug}） · 下载 ${item.downloads ?? "-"}\n\n`;

      const skill: Skill = {
        id,
        name: item.name,
        description,
        category: department,
        triggers: [item.name].filter(Boolean),
        preview: "markdown",
        source: "imported",
        enabled: true,
        featured: false,
        systemPrompt: attribution + body + extra,
      };

      rows.push(
        skillToInsert(skill, {
          origin: "skillhub",
          originPath: `${namespace}/${item.slug}`,
        }),
      );
      ownerCounts.set(owner, (ownerCounts.get(owner) ?? 0) + 1);
      importedForDept += 1;
    }
  }

  const written = await repositories.skills.upsertMany(rows);
  clearSkillsCache();
  return { imported: written, skipped };
}
