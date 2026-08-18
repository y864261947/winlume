import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Skill } from "@/lib/agent/types";
import { parseSkillMarkdown } from "./parse";

export const MASTER_SKILL_REPO = "https://github.com/swaylq/master-skill.git";

type MasterMeta = {
  name?: string;
  industry?: string;
  industry_cn?: string;
  triggers?: string[];
  version?: string;
};

export function categoryForMasterSlug(slug: string): string {
  const s = slug.toLowerCase();
  if (
    /seo|xiaohongshu|douyin|twitter|wechat|zhihu|newsletter|marketing|ads|ecommerce|amazon-operating|private-domain|live-commerce|short-video|aigc|creator|scriptwriting|web-novel|product-marketing|ad-agency/.test(
      s,
    )
  ) {
    return "marketing";
  }
  if (/photo|figma|ux|design|game-design|music|perfumery|sommelier/.test(s)) return "design";
  if (/law|insurance|icp-filing/.test(s)) return "legal";
  if (/invest|vc-investor|banking|crypto|poker/.test(s)) return "finance";
  if (/job-hunting|family-education|personal-trainer/.test(s)) return "hr";
  if (/consulting|ceo-master|management|product-ux|ai-product/.test(s)) return "product";
  if (
    /data-engineering|architecture|devops|sre|cyber|llm-agent|software|ios-app|independent-developer|github|ubnt|speech-to-text|semiconductor/.test(
      s,
    )
  ) {
    return "engineering";
  }
  if (/study|education|civil-service|youth|gaokao|academic/.test(s)) return "academic";
  return "specialized";
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map((item) => String(item).trim()).filter(Boolean);
  return items.length ? items : undefined;
}

export function skillFromMasterPackage(input: {
  slug: string;
  markdown: string;
  meta?: MasterMeta | null;
  originPath: string;
}): Skill {
  const parsed = parseSkillMarkdown(input.markdown, { fallbackId: input.slug });
  const title =
    input.meta?.industry_cn?.trim() ||
    (parsed.name && parsed.name.length <= 80 ? parsed.name : "") ||
    input.slug;
  const description =
    parsed.description ||
    (input.meta?.industry
      ? `${title}：${input.meta.industry} 行业资深判断与工作流。`
      : `${title} 行业资深判断与工作流。`);
  const triggers = parsed.triggers?.length ? parsed.triggers : asStringArray(input.meta?.triggers);
  return {
    ...parsed,
    id: input.slug,
    name: title,
    description,
    category: parsed.category && parsed.category !== "general"
      ? parsed.category
      : categoryForMasterSlug(input.slug),
    triggers,
    examplePrompt: parsed.examplePrompt,
    source: "imported",
    enabled: true,
    featured: false,
  };
}

export async function readMasterSkillPackages(rootDir: string): Promise<
  Array<{ skill: Skill; originPath: string }>
> {
  const prototypes = join(rootDir, "prototypes");
  let entries: string[] = [];
  try {
    entries = await readdir(prototypes);
  } catch {
    return [];
  }

  const out: Array<{ skill: Skill; originPath: string }> = [];
  for (const name of entries) {
    if (name.startsWith(".") || name.startsWith("_")) continue;
    const dir = join(prototypes, name);
    try {
      if (!(await stat(dir)).isDirectory()) continue;
    } catch {
      continue;
    }
    const skillPath = join(dir, "output", "SKILL.md");
    let markdown: string;
    try {
      markdown = await readFile(skillPath, "utf8");
    } catch {
      continue;
    }
    let meta: MasterMeta | null = null;
    try {
      meta = JSON.parse(await readFile(join(dir, "output", "meta.json"), "utf8")) as MasterMeta;
    } catch {
      meta = null;
    }
    const originPath = `prototypes/${name}/output/SKILL.md`;
    out.push({
      skill: skillFromMasterPackage({
        slug: name,
        markdown,
        meta,
        originPath,
      }),
      originPath,
    });
  }
  return out.sort((a, b) => a.skill.id.localeCompare(b.skill.id));
}
