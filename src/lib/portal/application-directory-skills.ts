import type { SkillMeta } from "@/lib/agent/types";
import { usableComposerPrompt } from "@/lib/studio/skill-prompt";
import {
  STUDIO_TOOL_CATEGORIES,
  skillDepartmentToToolCategory,
  studioSkillsHref,
  type StudioToolCategoryId,
} from "@/lib/studio/tool-categories";

export type PortalToolCategory =
  | "内容与营销"
  | "视觉与媒体"
  | "电商与销售"
  | "财务与法务"
  | "产品与研发"
  | "办公与管理"
  | "数据与科研"
  | "开发与代码";

export const PORTAL_TOOL_CATEGORY_TO_CATALOG: Record<
  PortalToolCategory,
  StudioToolCategoryId
> = {
  "内容与营销": "content-marketing",
  "视觉与媒体": "visual-media",
  "电商与销售": "ecommerce-sales",
  "财务与法务": "legal-finance",
  "产品与研发": "product-rd",
  "办公与管理": "office-admin",
  "数据与科研": "data-research",
  "开发与代码": "development",
};

const CATALOG_TO_PORTAL_CATEGORY = Object.fromEntries(
  Object.entries(PORTAL_TOOL_CATEGORY_TO_CATALOG).map(([name, catalog]) => [
    catalog,
    name,
  ]),
) as Record<StudioToolCategoryId, PortalToolCategory>;

export function portalCategoryToCatalog(
  category: PortalToolCategory,
): StudioToolCategoryId {
  return PORTAL_TOOL_CATEGORY_TO_CATALOG[category];
}

export function portalCategoryFromSkill(skill: Pick<SkillMeta, "category">): PortalToolCategory {
  return CATALOG_TO_PORTAL_CATEGORY[skillDepartmentToToolCategory(skill.category)];
}

export function portalSkillsHref(
  category: PortalToolCategory | "全部应用",
): string {
  if (category === "全部应用") return studioSkillsHref();
  return studioSkillsHref(portalCategoryToCatalog(category));
}

export function portalSkillCountsFromCatalogs(
  catalogs: Array<{ id: string; count: number }>,
): Record<PortalToolCategory, number> {
  const counts = new Map(catalogs.map((row) => [row.id, row.count]));
  return {
    "内容与营销": counts.get("content-marketing") ?? 0,
    "视觉与媒体": counts.get("visual-media") ?? 0,
    "电商与销售": counts.get("ecommerce-sales") ?? 0,
    "财务与法务": counts.get("legal-finance") ?? 0,
    "产品与研发": counts.get("product-rd") ?? 0,
    "办公与管理": counts.get("office-admin") ?? 0,
    "数据与科研": counts.get("data-research") ?? 0,
    "开发与代码": counts.get("development") ?? 0,
  };
}

export function applicationCatalogSkillHref(
  skill: Pick<SkillMeta, "id" | "name" | "examplePrompt">,
): string {
  const params = new URLSearchParams();
  params.set("entry", "application-catalog");
  params.set("skill", skill.id);
  params.set("skillName", skill.name);
  const prompt = usableComposerPrompt(skill.examplePrompt);
  if (prompt) params.set("prompt", prompt);
  return `/studio?${params.toString()}`;
}

export function skillsForPortalCategory(
  skills: SkillMeta[],
  category: PortalToolCategory | "全部应用",
  limit = category === "全部应用" ? 12 : 6,
): SkillMeta[] {
  if (category === "全部应用") return pickDiverseCatalogSkills(skills, limit);
  const catalog = portalCategoryToCatalog(category);
  return skills
    .filter((skill) => skillDepartmentToToolCategory(skill.category) === catalog)
    .slice(0, limit);
}

function pickDiverseCatalogSkills(skills: SkillMeta[], limit: number): SkillMeta[] {
  const buckets = new Map<StudioToolCategoryId, SkillMeta[]>();
  for (const skill of skills) {
    const catalog = skillDepartmentToToolCategory(skill.category);
    const list = buckets.get(catalog) ?? [];
    list.push(skill);
    buckets.set(catalog, list);
  }
  const picked: SkillMeta[] = [];
  let round = 0;
  while (picked.length < limit) {
    let added = false;
    for (const category of STUDIO_TOOL_CATEGORIES) {
      const skill = buckets.get(category.id)?.[round];
      if (!skill) continue;
      picked.push(skill);
      added = true;
      if (picked.length >= limit) break;
    }
    if (!added) break;
    round += 1;
  }
  return picked;
}
