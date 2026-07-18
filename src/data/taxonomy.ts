import {
  AudioLines,
  Blocks,
  Brain,
  Database,
  Image,
  LayoutGrid,
  LucideIcon,
  ScanSearch,
  Video,
  Wand2,
} from "lucide-react";

export type CateSlug = "api" | "app";

export interface CateTab {
  slug: CateSlug;
  name: string;
}

export const cateTabs: CateTab[] = [
  { slug: "api", name: "API" },
  { slug: "app", name: "应用" },
];

export interface Category {
  slug: string;
  name: string;
  cate: CateSlug;
  icon: LucideIcon;
  /** 类目识别色：卡片圆点、筛选器、菜单中作为信息色使用 */
  color: string;
  brands: string[];
}

export const categories: Category[] = [
  {
    slug: "llm",
    name: "语言大模型",
    cate: "api",
    icon: Brain,
    color: "#5b54f0",
    brands: ["星澜 Astral", "子午线 Meridian", "北极星 Polaris", "竹言 Bamboo", "潮汐 Tidal"],
  },
  {
    slug: "image-gen",
    name: "图片生成",
    cate: "api",
    icon: Image,
    color: "#0ea5e9",
    brands: ["流明绘 Lumina", "幻景 Mirage", "像素波 PixelWave"],
  },
  {
    slug: "image-edit",
    name: "图片处理",
    cate: "api",
    icon: Wand2,
    color: "#14b8a6",
    brands: ["净刻 ClearCut", "润图坊 Retouchly", "流明绘 Lumina", "幻景 Mirage"],
  },
  {
    slug: "video-gen",
    name: "视频生成",
    cate: "api",
    icon: Video,
    color: "#f43f5e",
    brands: ["动影 Motionry", "流影 CineFlow", "像素波 PixelWave"],
  },
  {
    slug: "av",
    name: "音视频处理",
    cate: "api",
    icon: AudioLines,
    color: "#f59e0b",
    brands: ["声屿 Sonique", "声格 Voxelle"],
  },
  {
    slug: "info",
    name: "信息处理",
    cate: "api",
    icon: ScanSearch,
    color: "#22c55e",
    brands: ["询集 Queryly", "文鉴 DocLens"],
  },
  {
    slug: "rag",
    name: "RAG相关",
    cate: "api",
    icon: Database,
    color: "#f97316",
    brands: ["向量谷 Vectoris", "忆库 Recallr"],
  },
  {
    slug: "tool-api",
    name: "工具API",
    cate: "api",
    icon: Blocks,
    color: "#64748b",
    brands: ["WinLume 自营", "净刻 ClearCut"],
  },
  {
    slug: "apps",
    name: "应用工具",
    cate: "app",
    icon: LayoutGrid,
    color: "#ec4899",
    brands: ["WinLume 自营"],
  },
];

export function getCategory(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

export function categoriesByCate(cate: CateSlug): Category[] {
  return categories.filter((c) => c.cate === cate);
}

/** 类目色的浅底样式（图标瓷贴等），返回可内联使用的 style 对象 */
export function categoryTint(color: string): { backgroundColor: string; color: string } {
  return {
    backgroundColor: `color-mix(in srgb, ${color} 11%, #ffffff)`,
    color,
  };
}
