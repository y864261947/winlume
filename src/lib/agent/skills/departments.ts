/** Display order for primary browse; unknown ids sort after, by label. */
export const DEPARTMENT_ORDER = [
  "marketing",
  "design",
  "engineering",
  "product",
  "sales",
  "finance",
  "paid-media",
  "project-management",
  "testing",
  "support",
  "security",
  "hr",
  "legal",
  "supply-chain",
  "academic",
  "game-development",
  "gis",
  "spatial-computing",
  "specialized",
] as const;

const LABELS: Record<string, string> = {
  marketing: "营销",
  design: "设计",
  engineering: "工程",
  product: "产品",
  sales: "销售",
  finance: "金融",
  "paid-media": "付费媒体",
  "project-management": "项目管理",
  testing: "测试",
  support: "支持",
  security: "安全",
  hr: "人力",
  legal: "法务",
  "supply-chain": "供应链",
  academic: "学术",
  "game-development": "游戏",
  gis: "GIS",
  "spatial-computing": "空间计算",
  specialized: "专项",
};

export function departmentLabel(id: string): string {
  return LABELS[id] ?? id;
}

export function sortDepartmentIds(ids: string[]): string[] {
  const rank = new Map(DEPARTMENT_ORDER.map((d, i) => [d, i]));
  return [...ids].sort((a, b) => {
    const ra = rank.get(a as (typeof DEPARTMENT_ORDER)[number]) ?? 1000;
    const rb = rank.get(b as (typeof DEPARTMENT_ORDER)[number]) ?? 1000;
    if (ra !== rb) return ra - rb;
    return departmentLabel(a).localeCompare(departmentLabel(b), "zh");
  });
}
