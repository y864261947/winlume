import {
  BriefcaseBusiness,
  Clapperboard,
  GraduationCap,
  HeartPulse,
  LucideIcon,
  Plane,
  ShoppingCart,
  Sparkles,
  UtensilsCrossed,
  WalletCards,
} from "lucide-react";

export type Audience = "personal" | "business";

export interface Industry {
  name: string;
  icon: LucideIcon;
}

/** 首访身份选择中企业用户可选的行业偏好（最多 3 项）。 */
export const industries: Industry[] = [
  { name: "内容媒体", icon: Clapperboard },
  { name: "电商零售", icon: ShoppingCart },
  { name: "教育培训", icon: GraduationCap },
  { name: "企业服务", icon: BriefcaseBusiness },
  { name: "餐饮美食", icon: UtensilsCrossed },
  { name: "美妆美业", icon: Sparkles },
  { name: "金融保险", icon: WalletCards },
  { name: "旅游出行", icon: Plane },
  { name: "医疗健康", icon: HeartPulse },
];

export interface BusinessCase {
  id: string;
  /** 虚构客户名（演示占位） */
  client: string;
  industry: string;
  /** 一句话使用场景 */
  scenario: string;
  /** 成效指标，如"内容产能提升 3 倍" */
  outcome: string;
  /** 关联产品 id（src/data/products.ts），卡片可链到详情页 */
  productId?: string;
}

/** 企业版案例墙的虚构占位案例，覆盖全部九个行业。 */
export const businessCases: BusinessCase[] = [
  {
    id: "case-media",
    client: "星野传媒",
    industry: "内容媒体",
    scenario: "短视频脚本批量产出与多平台内容矩阵分发",
    outcome: "内容产能提升 3 倍",
    productId: "motionry-3",
  },
  {
    id: "case-ecommerce",
    client: "橙子优选",
    industry: "电商零售",
    scenario: "商品主图批量生成与详情页文案自动撰写",
    outcome: "上新效率提升 5 倍",
    productId: "app-image-studio",
  },
  {
    id: "case-edu",
    client: "知更鸟课堂",
    industry: "教育培训",
    scenario: "课件一键生成与个性化配套练习编排",
    outcome: "备课时间减少 60%",
    productId: "app-ppt",
  },
  {
    id: "case-enterprise",
    client: "北辰科技",
    industry: "企业服务",
    scenario: "客服知识库智能问答与工单自动摘要",
    outcome: "首次响应缩短至 30 秒",
    productId: "astral-4-pro",
  },
  {
    id: "case-food",
    client: "锅气餐饮集团",
    industry: "餐饮美食",
    scenario: "门店营销海报生成与大众点评自动回复",
    outcome: "营销素材成本下降 70%",
    productId: "lumina-2",
  },
  {
    id: "case-beauty",
    client: "花漾美妆",
    industry: "美妆美业",
    scenario: "新品种草图文创作与达人合作 brief 起草",
    outcome: "种草内容周更 200+ 篇",
    productId: "polaris-chat",
  },
  {
    id: "case-finance",
    client: "恒信保险",
    industry: "金融保险",
    scenario: "保险条款智能解读与理赔材料初步审核",
    outcome: "单证处理提速 4 倍",
    productId: "doclens-parse",
  },
  {
    id: "case-travel",
    client: "云程旅行",
    industry: "旅游出行",
    scenario: "个性化行程规划与多语言旅行攻略生成",
    outcome: "定制方案产出提速 10 倍",
    productId: "meridian-max",
  },
  {
    id: "case-health",
    client: "康禾健康",
    industry: "医疗健康",
    scenario: "健康科普内容撰写与患者随访话术整理",
    outcome: "科普内容审核通过率 98%",
    productId: "app-doc-assistant",
  },
];

/** 客户 logo 墙（文字 logo，虚构占位）。 */
export const clientLogos: string[] = [
  "星野传媒",
  "橙子优选",
  "知更鸟课堂",
  "北辰科技",
  "锅气集团",
  "花漾美妆",
  "恒信保险",
  "云程旅行",
];
