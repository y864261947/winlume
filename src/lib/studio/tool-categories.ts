import {
  BarChart3,
  Briefcase,
  Code2,
  Image as ImageIcon,
  Lightbulb,
  Megaphone,
  Scale,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";

/**
 * First-level Studio tool catalog.
 * Order matches the product taxonomy grid (2 × 4).
 */
export const STUDIO_TOOL_CATEGORY_IDS = [
  "content-marketing",
  "visual-media",
  "ecommerce-sales",
  "legal-finance",
  "product-rd",
  "office-admin",
  "data-research",
  "development",
] as const;

export type StudioToolCategoryId = (typeof STUDIO_TOOL_CATEGORY_IDS)[number];

export type StudioToolCategory = {
  id: StudioToolCategoryId;
  name: string;
  summary: string;
  icon: LucideIcon;
  /** Category hue. Mixed against surface so the same hex works in light and dark Studio. */
  accent: string;
};

export const STUDIO_TOOL_CATEGORIES: readonly StudioToolCategory[] = [
  {
    id: "content-marketing",
    name: "内容与营销",
    summary: "文案、投放、内容策划与增长",
    icon: Megaphone,
    accent: "#e11d48",
  },
  {
    id: "visual-media",
    name: "视觉与媒体",
    summary: "图片处理、设计与影像制作",
    icon: ImageIcon,
    accent: "#7c3aed",
  },
  {
    id: "ecommerce-sales",
    name: "电商与销售",
    summary: "商品图、店铺运营与成交转化",
    icon: ShoppingBag,
    accent: "#d97706",
  },
  {
    id: "legal-finance",
    name: "法务与财务",
    summary: "合同、合规、账务与税务",
    icon: Scale,
    accent: "#2563eb",
  },
  {
    id: "product-rd",
    name: "产品与研发",
    summary: "需求、原型、测试与评审",
    icon: Lightbulb,
    accent: "#ca8a04",
  },
  {
    id: "office-admin",
    name: "办公与管理",
    summary: "文档、人事、项目与协作",
    icon: Briefcase,
    accent: "#0284c7",
  },
  {
    id: "data-research",
    name: "数据与科研",
    summary: "分析、研究、空间与学术",
    icon: BarChart3,
    accent: "#059669",
  },
  {
    id: "development",
    name: "开发与代码",
    summary: "工程实现、架构与安全",
    icon: Code2,
    accent: "#4f46e5",
  },
] as const;

const DEPARTMENT_TO_CATEGORY: Record<string, StudioToolCategoryId> = {
  marketing: "content-marketing",
  "paid-media": "content-marketing",
  design: "visual-media",
  "game-development": "visual-media",
  sales: "ecommerce-sales",
  "supply-chain": "ecommerce-sales",
  legal: "legal-finance",
  finance: "legal-finance",
  product: "product-rd",
  testing: "product-rd",
  specialized: "product-rd",
  "project-management": "office-admin",
  hr: "office-admin",
  support: "office-admin",
  academic: "data-research",
  gis: "data-research",
  engineering: "development",
  security: "development",
  "spatial-computing": "development",
};

export function isStudioToolCategoryId(
  value: string,
): value is StudioToolCategoryId {
  return STUDIO_TOOL_CATEGORY_IDS.includes(value as StudioToolCategoryId);
}

export function getStudioToolCategory(
  id: string,
): StudioToolCategory | null {
  return STUDIO_TOOL_CATEGORIES.find((category) => category.id === id) ?? null;
}

export function listStudioToolCategories(): StudioToolCategory[] {
  return [...STUDIO_TOOL_CATEGORIES];
}

export function studioToolsHref(catalog?: StudioToolCategoryId): string {
  if (!catalog) return "/studio/tools";
  return `/studio/tools?catalog=${encodeURIComponent(catalog)}`;
}

export function studioToolCategoryHref(id: StudioToolCategoryId): string {
  return studioToolsHref(id);
}

export function studioSkillsHref(catalog?: StudioToolCategoryId): string {
  if (!catalog) return "/studio/skills";
  return `/studio/skills?catalog=${encodeURIComponent(catalog)}`;
}

/** Map a Skill department id onto the 8-category catalog. Unknown ids fall back to 产品与研发. */
export function skillDepartmentToToolCategory(
  departmentId: string,
): StudioToolCategoryId {
  return DEPARTMENT_TO_CATEGORY[departmentId] ?? "product-rd";
}

export type StudioCatalogCount = {
  id: StudioToolCategoryId;
  name: string;
  summary: string;
  count: number;
};

/** Roll department counts up to the 8-category workbench. */
export function catalogsFromDepartmentCounts(
  departments: readonly { id: string; count: number }[],
): StudioCatalogCount[] {
  const counts = new Map<StudioToolCategoryId, number>();
  for (const department of departments) {
    const catalog = skillDepartmentToToolCategory(department.id);
    counts.set(catalog, (counts.get(catalog) ?? 0) + department.count);
  }
  return listStudioToolCategories().map((category) => ({
    id: category.id,
    name: category.name,
    summary: category.summary,
    count: counts.get(category.id) ?? 0,
  }));
}
