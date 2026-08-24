export const DRAW_TEMPLATE_CATEGORIES = [
  "全部",
  "户外运动",
  "服装服饰",
  "鞋靴箱包",
  "家具家居",
  "美妆个护",
] as const;

export type DrawTemplate = {
  id: string;
  title: string;
  count: number;
  category: (typeof DRAW_TEMPLATE_CATEGORIES)[number];
  src: string;
  prompt: string;
};

export const DRAW_TEMPLATES: readonly DrawTemplate[] = [
  { id: "hero", title: "极简商品主图", count: 15, category: "美妆个护", src: "/studio-prototype/templates/template-card-00.png", prompt: "极简商品主图，干净背景，突出材质和标签。" },
  { id: "lifestyle", title: "场景种草图", count: 12, category: "服装服饰", src: "/studio-prototype/templates/template-card-01.png", prompt: "生活场景种草图，自然光，突出穿着和使用方式。" },
  { id: "spec", title: "卖点结构图", count: 18, category: "鞋靴箱包", src: "/studio-prototype/templates/template-card-02.png", prompt: "卖点结构图，拆解功能模块，保留商品比例。" },
  { id: "sport", title: "运动商品套图", count: 14, category: "户外运动", src: "/studio-prototype/templates/template-card-03.png", prompt: "运动场景套图，强调动态和功能卖点。" },
  { id: "detail", title: "细节卖点图", count: 10, category: "鞋靴箱包", src: "/studio-prototype/templates/template-card-04.png", prompt: "细节特写图，材质、走线和五金清晰可见。" },
  { id: "campaign", title: "品牌活动图", count: 16, category: "服装服饰", src: "/studio-prototype/templates/template-card-05.png", prompt: "品牌活动主图，构图完整，适合投放。" },
];
