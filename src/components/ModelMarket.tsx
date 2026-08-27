"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button as HeroButton, Card as HeroCard, Tabs } from "@heroui/react";
import { BarChart3, ChevronLeft, ChevronRight, CircleHelp, Code2, Crown, FileImage, LayoutGrid, Search, ArrowUp, Presentation, ShoppingBag, Video } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useModals } from "@/components/providers";
import PortalHeader from "@/components/PortalHeader";
import { formatBalance } from "@/lib/account";
import { getVendorByKey } from "@/lib/catalog/vendors";
import { WORK_SCENES, type WorkSceneId } from "@/lib/studio/work-scenes";

declare global {
  interface Window {
    chatwootSDK?: {
      run: (config: { websiteToken: string; baseUrl: string }) => void;
    };
    $chatwoot?: {
      toggle: (state?: "open" | "close") => void;
    };
    chatwootSettings?: {
      hideMessageBubble?: boolean;
    };
    __reizoChatwootStarted?: boolean;
  }
}

const CHATWOOT_BASE_URL = "https://chat.v2api.top";
const CHATWOOT_WEBSITE_TOKEN = "kZgsMkESfeGDBRWCHcKeTNYS";
const PORTAL_ONBOARDING_STORAGE_KEY = "reizo-portal-onboarding-v1";

const onboardingSteps = [
  {
    target: "agent" as const,
    title: "Agent 智能工作台",
    lead: "与 AI 对话，制作你要的素材。",
    body: "支持内容创作、文件处理、数据分析、办公协作、代码开发等多场景任务，创建属于你的工作流。",
  },
  {
    target: "api" as const,
    title: "API 模型中心",
    lead: "接入全球领先 AI 模型能力。",
    body: "按需调用语言、图像、视频、音频、知识库等模型，灵活满足开发与应用接入需求。",
  },
  {
    target: "tools" as const,
    title: "AI应用工具与Skills技能",
    lead: "300+ 应用工具 · 2600+ Skills 技能。",
    body: "覆盖电商、营销、财务、法务、科研、办公、开发等多行业场景的一键式 AI 指令，快速找到适合你的 AI 能力。",
  },
] as const;

type OnboardingPlacement = {
  left: number;
  top: number;
  lineLeft: number;
  lineTop: number;
  lineWidth: number;
  lineAngle: number;
};

type AssetIconProps = { src: string; alt?: string; className?: string };

function AssetIcon({ src, alt = "", className }: AssetIconProps) {
  return <Image src={src} alt={alt} width={38} height={38} className={className} unoptimized />;
}

type PortalLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  tabIndex?: number;
  target?: "_blank" | "_self";
  "aria-hidden"?: boolean;
};

function PortalLink({ href, children, className, onClick, tabIndex, target = "_blank", "aria-hidden": ariaHidden }: PortalLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={onClick}
      tabIndex={tabIndex}
      target={target}
      rel={target === "_blank" ? "noopener noreferrer" : undefined}
      aria-hidden={ariaHidden}
    >
      {children}
    </Link>
  );
}

type ApiBrandLink = {
  label: string;
  href: string;
  icon: string;
  description: string;
};

type ApiCategory = {
  id: string;
  label: string;
  icon: string;
  /** Inline brand / product chips (302-style row) */
  brands: readonly ApiBrandLink[];
  /** Fallback when brands empty — full category entry */
  href: string;
};

const apiProvider = (label: string, key: string, description: string): ApiBrandLink => ({
  label,
  icon: getVendorByKey(key).logo,
  description,
  href: `/products?cate=api&brand=${encodeURIComponent(key)}`,
});

const searchSuggestions = [
  { label: "产品图生成", icon: FileImage },
  { label: "短视频创作", icon: Video },
  { label: "PPT 生成", icon: Presentation },
  { label: "财务分析", icon: BarChart3 },
  { label: "代码生成", icon: Code2 },
  { label: "电商运营", icon: ShoppingBag },
] as const;

/** Hardcoded Model Review carousel slides (generated banners in public/). */
type FeaturedSlide = { id: string; src: string; alt: string; href: string };

const FEATURED_SLIDES: FeaturedSlide[] = [
  {
    id: "claude-fable-5",
    src: "/figma-home/featured/slide-claude-fable-5.png",
    alt: "Model Review · Claude Fable 5",
    href: "/products?cate=api",
  },
  {
    id: "gpt-5-6-sol",
    src: "/figma-home/featured/slide-gpt-5-6-sol.png",
    alt: "Model Review · GPT-5.6 Sol",
    href: "/products?cate=api",
  },
] as const;

const FEATURED_AUTO_MS = 5000;

/** Homepage API categories. Expanded cards deliberately expose real vendor choices. */
const apiCategories: readonly ApiCategory[] = [
  {
    id: "llm",
    label: "语言推理",
    icon: "/figma-home/icon-chat.svg",
    href: "/products?cate=api",
    brands: [
      apiProvider("OpenAI", "openai", "GPT 与多模态通用模型"), apiProvider("Anthropic", "anthropic", "Claude 长文本与推理模型"),
      apiProvider("Gemini", "google", "Google 多模态模型"), apiProvider("Grok", "xai", "xAI 实时推理模型"),
      apiProvider("通义千问", "alibaba", "阿里云 Qwen 系列"), apiProvider("DeepSeek", "deepseek", "推理与代码模型"),
      apiProvider("智谱清言", "zhipu", "GLM 中文大模型"), apiProvider("Kimi", "moonshot", "长上下文模型"),
      apiProvider("豆包", "bytedance", "字节通用模型"), apiProvider("腾讯混元", "tencent", "腾讯多模态模型"),
      apiProvider("文心", "baidu", "百度 ERNIE 模型"), apiProvider("百川", "baichuan", "百川通用模型"),
    ],
  },
  {
    id: "image-processing",
    label: "图像处理",
    icon: "/figma-home/icon-image.svg",
    href: "/products?cate=api",
    brands: [
      apiProvider("OpenAI", "openai", "DALL·E 图像生成"), apiProvider("FLUX", "black-forest", "高质量文生图模型"),
      apiProvider("Stability AI", "stability", "Stable Diffusion 系列"), apiProvider("Gemini", "google", "Imagen 图像生成"),
      apiProvider("阶跃星辰", "stepfun", "图像与视觉理解"), apiProvider("腾讯混元", "tencent", "混元图像创作"),
    ],
  },
  {
    id: "video",
    label: "视频处理",
    icon: "/figma-home/icon-video.svg",
    href: "/products?cate=api",
    brands: [
      apiProvider("OpenAI", "openai", "Sora 视频生成"), apiProvider("腾讯混元", "tencent", "图生视频与特效"),
      apiProvider("字节跳动", "bytedance", "Seedance 视频创作"), apiProvider("通义千问", "alibaba", "Wan 视频模型"),
      apiProvider("MiniMax", "minimax", "海螺视频生成"),
    ],
  },
  {
    id: "audio",
    label: "音频处理",
    icon: "/figma-home/icon-voice.svg",
    href: "/products?cate=api",
    brands: [
      apiProvider("OpenAI", "openai", "Whisper 与语音合成"), apiProvider("MiniMax", "minimax", "语音与音乐生成"),
      apiProvider("字节跳动", "bytedance", "实时语音能力"), apiProvider("腾讯混元", "tencent", "语音识别与合成"),
      apiProvider("Google", "google", "多语言语音模型"),
    ],
  },
  {
    id: "info",
    label: "信息检索",
    icon: "/figma-home/icon-search.svg",
    href: "/products?cate=api",
    brands: [
      apiProvider("Jina AI", "jina", "检索、重排与阅读"), apiProvider("Cohere", "cohere", "联网检索与重排"),
      apiProvider("Google", "google", "全球搜索与知识理解"), apiProvider("Microsoft", "microsoft", "Bing 检索能力"),
    ],
  },
  {
    id: "rag",
    label: "RAG知识库",
    icon: "/figma-home/icon-db.svg",
    href: "/products?cate=api",
    brands: [
      apiProvider("OpenAI", "openai", "Embedding 向量模型"), apiProvider("Jina AI", "jina", "Embedding 与 Rerank"),
      apiProvider("Cohere", "cohere", "企业级 RAG 模型"), apiProvider("通义千问", "alibaba", "中文知识库检索"),
      apiProvider("智谱清言", "zhipu", "知识问答与向量能力"),
    ],
  },
];

const workSceneIcons: Record<WorkSceneId, string> = {
  "content-office": "/figma-home/tool-content.svg",
  "growth-commerce": "/figma-home/tool-commerce.svg",
  "video-creation": "/figma-home/tool-video.svg",
  "developer-api": "/figma-home/tool-api.svg",
  "agent-automation": "/figma-home/tool-agent.svg",
};

const workScenes = WORK_SCENES.map((scene) => ({
  ...scene,
  icon: workSceneIcons[scene.id],
  href: `/studio/skills?scene=${encodeURIComponent(scene.id)}`,
}));

const toolApplications = [
  { label: "内容与营销", detail: "文案创作、SEO、社媒运营", icon: "/figma-home/tool-content.svg", href: "/studio/skills?scene=content-office" },
  { label: "视觉与媒体", detail: "图像处理、视频创作、素材生成", icon: "/figma-home/icon-image.svg", href: "/studio?preset=image-default" },
  { label: "电商与销售", detail: "商品分析、运营增长、CRM", icon: "/figma-home/tool-commerce.svg", href: "/studio/skills?scene=growth-commerce" },
  { label: "财务与法务", detail: "合同审查、报表分析、合规助手", icon: "/figma-home/icon-db.svg", href: "/studio/skills?scene=content-office" },
  { label: "产品与研发", detail: "需求分析、原型设计、PRD", icon: "/figma-home/tool-agent.svg", href: "/studio/skills?scene=agent-automation" },
  { label: "办公与管理", detail: "PPT、文档处理、会议纪要", icon: "/figma-home/icon-video.svg", href: "/studio/skills?scene=content-office" },
  { label: "数据与科研", detail: "数据分析、可视化、研究报告", icon: "/figma-home/icon-search.svg", href: "/products?cate=app" },
  { label: "开发与代码", detail: "代码生成、调试、API 开发", icon: "/figma-home/tool-api.svg", href: "/studio/skills?scene=developer-api" },
] as const;

type PortalApplicationPreview = "storyboard" | "poster" | "subtitles" | "avatar" | "extract" | "product" | "finance" | "slides" | "code" | "contract";
type PortalCapabilityEvidence = "models" | "skills" | "agent" | "usage";

const portalApplicationShowcase: ReadonlyArray<{ title: string; detail: string; href: string; tone: string; preview: PortalApplicationPreview }> = [
  { title: "AI视频生成", detail: "从脚本到短片，一键生成分镜与成片", href: "/studio?preset=video-default", tone: "violet", preview: "storyboard" },
  { title: "视觉海报设计", detail: "营销海报、活动主视觉快速产出", href: "/studio?preset=image-default", tone: "rose", preview: "poster" },
  { title: "AI视频翻译", detail: "字幕翻译、配音与多语种本地化", href: "/studio?preset=video-default", tone: "teal", preview: "subtitles" },
  { title: "AI视频数字人", detail: "创建口播讲解、培训与产品演示", href: "/studio", tone: "blue", preview: "avatar" },
  { title: "AI智能提取", detail: "从文档、网页和图片提取结构化信息", href: "/studio/skills?scene=content-office", tone: "amber", preview: "extract" },
  { title: "产品图生成", detail: "商品场景图、主图和电商素材", href: "/studio?preset=image-default", tone: "cyan", preview: "product" },
  { title: "财务分析助手", detail: "报表解读、指标分析与结论整理", href: "/studio/skills?scene=growth-commerce", tone: "green", preview: "finance" },
  { title: "PPT 生成", detail: "快速把想法整理成可演示的页面", href: "/studio/skills?scene=content-office", tone: "indigo", preview: "slides" },
  { title: "代码生成", detail: "从需求到代码、调试和接口说明", href: "/studio/skills?scene=developer-api", tone: "slate", preview: "code" },
  { title: "合同审查", detail: "识别风险条款并生成审阅建议", href: "/studio/skills?scene=content-office", tone: "orange", preview: "contract" },
];

const portalCapabilityCards: ReadonlyArray<{ title: string; detail: string; badge: string; href: string; tone: string; evidence: PortalCapabilityEvidence }> = [
  { title: "多模型，一处使用", detail: "GPT、Claude、Gemini、DeepSeek 等模型统一调用", badge: "模型能力", href: "/products?cate=api", tone: "blue", evidence: "models" },
  { title: "2600+ Skills 技能", detail: "从内容创作到专业任务，找到可直接使用的指令", badge: "技能专家", href: "/studio/skills", tone: "purple", evidence: "skills" },
  { title: "Agent 工作流", detail: "把模型、工具和 Skills 自动串成专属流程", badge: "智能专家", href: "/studio", tone: "teal", evidence: "agent" },
  { title: "灵活计费", detail: "按实际用量结算，额度、消耗和成本清晰可见", badge: "账户专家", href: "/account/wallet", tone: "orange", evidence: "usage" },
];

function ApplicationResultPreview({ kind }: { kind: PortalApplicationPreview }) {
  if (kind === "storyboard") return <span className="portal-result-preview is-storyboard" aria-hidden><i /><i /><i /><b>12s</b><em>脚本 → 成片</em></span>;
  if (kind === "poster") return <span className="portal-result-preview is-poster" aria-hidden><small>OPEN STUDIO</small><b>NOVA<br />FORM</b><i>26</i><em>春日视觉提案</em></span>;
  if (kind === "subtitles") return <span className="portal-result-preview is-subtitles" aria-hidden><i /><b>English narration</b><strong>中文配音已同步</strong><em><i /><i /><i /><i /><i /></em></span>;
  if (kind === "avatar") return <span className="portal-result-preview is-avatar" aria-hidden><i className="portal-avatar-orbit" /><i className="portal-avatar-head" /><i className="portal-avatar-body" /><b>产品演示 · 00:18</b><em><i /><i /><i /><i /><i /></em></span>;
  if (kind === "extract") return <span className="portal-result-preview is-extract" aria-hidden><i className="portal-extract-document" /><span><b>¥ 268,000</b><em>合同金额</em><strong>2026.09.30</strong></span></span>;
  if (kind === "product") return <span className="portal-result-preview is-product" aria-hidden><i /><i /><i /><b>商品主图 · 4:5</b></span>;
  if (kind === "finance") return <span className="portal-result-preview is-finance" aria-hidden><b>¥ 1.24M</b><i /><span><em>营收</em><strong>+18.6%</strong></span></span>;
  if (kind === "slides") return <span className="portal-result-preview is-slides" aria-hidden><i><b>Q3</b><em>品牌增长提案</em></i><i /><i /><strong>8 页已生成</strong></span>;
  if (kind === "code") return <span className="portal-result-preview is-code" aria-hidden><i>const <b>report</b> = await</i><i>  reizo.<b>analyze</b>({`{`}</i><i>    source: "sales.csv"</i><i>  {`}`});</i><strong>✓ 已生成接口</strong></span>;
  return <span className="portal-result-preview is-contract" aria-hidden><i>SUPPLY AGREEMENT</i><i /><i /><b>付款条款</b><em>风险提示 · 2</em></span>;
}

function CapabilityEvidence({ kind }: { kind: PortalCapabilityEvidence }) {
  if (kind === "models") return <span className="portal-capability-evidence is-models" aria-hidden><i>GPT-5</i><i>Claude</i><i>Gemini</i><b>统一路由</b></span>;
  if (kind === "skills") return <span className="portal-capability-evidence is-skills" aria-hidden><b>/ 商品上新文案</b><i>✓ 标题</i><i>✓ 卖点</i><i>✓ SEO</i></span>;
  if (kind === "agent") return <span className="portal-capability-evidence is-agent" aria-hidden><i>输入</i><span>→</span><i>研究</i><span>→</span><i>交付</i><b>已完成</b></span>;
  return <span className="portal-capability-evidence is-usage" aria-hidden><i /><i /><i /><i /><i /><b>本月 ¥ 86.42</b></span>;
}

const productPaths = [
  {
    id: "api",
    index: "01",
    title: "一个 API Key，连接全部模型",
    outcome: "多模态统一接入，OpenAI 兼容，换模型不用改代码。",
    meta: "模型 API",
    href: "/products?cate=api",
    cta: "浏览模型",
    preview: {
      kind: "api" as const,
      eyebrow: "Live request",
      title: "chat.completions",
      lines: [
        { k: "model", v: "kimi-k2" },
        { k: "stream", v: "true" },
        { k: "latency", v: "312ms" },
      ],
      foot: "POST /v1/chat/completions",
    },
  },
  {
    id: "image",
    index: "02",
    title: "一句话生成可用的视觉资产",
    outcome: "海报、产品图与社媒素材，从提示词到多版本导出。",
    meta: "图片创作",
    href: "/studio?preset=image-default",
    cta: "开始创作",
    preview: {
      kind: "image" as const,
      eyebrow: "Studio · Image",
      title: "4 variants ready",
      lines: [
        { k: "prompt", v: "minimal product shot" },
        { k: "size", v: "1024×1024" },
        { k: "style", v: "studio soft" },
      ],
      foot: "preset · image-default",
    },
  },
  {
    id: "video",
    index: "03",
    title: "从脚本到成片，同一工作台",
    outcome: "选题、分镜、画面与导出串成一条流水线。",
    meta: "视频创作",
    href: "/studio?preset=video-default",
    cta: "开始创作",
    preview: {
      kind: "video" as const,
      eyebrow: "Studio · Video",
      title: "Script → shot list",
      lines: [
        { k: "scene", v: "03 / 08" },
        { k: "duration", v: "00:24" },
        { k: "voice", v: "zh-CN natural" },
      ],
      foot: "preset · video-default",
    },
  },
  {
    id: "agent",
    index: "04",
    title: "让 Agent 直接完成复杂任务",
    outcome: "对话、工具、作品和人工确认都在同一个工作台里完成。",
    meta: "Agent 工作台",
    href: "/studio",
    cta: "打开工作台",
    preview: {
      kind: "flow" as const,
      eyebrow: "Agent workspace",
      title: "Research and deliver",
      lines: [
        { k: "context", v: "project · files · skills" },
        { k: "tools", v: "artifacts · canvas · sheets" },
        { k: "status", v: "durable and resumable" },
      ],
      foot: "chat · tools · artifacts",
    },
  },
  {
    id: "team",
    index: "05",
    title: "不再共享一把密钥",
    outcome: "成员、项目 Key、预算与调用记录统一归属。",
    meta: "团队管理",
    href: "/account/team",
    cta: "管理团队",
    preview: {
      kind: "team" as const,
      eyebrow: "Team console",
      title: "Project keys",
      lines: [
        { k: "members", v: "12 active" },
        { k: "budget", v: "68% used" },
        { k: "audit", v: "live trail" },
      ],
      foot: "keys · permissions",
    },
  },
  {
    id: "business",
    index: "06",
    title: "私有化与专属部署，按你的流程接",
    outcome: "知识库、权限审批与专属环境，从方案到上线有人对接。",
    meta: "企业方案",
    href: "/business",
    cta: "查看方案",
    preview: {
      kind: "biz" as const,
      eyebrow: "Enterprise",
      title: "Deploy with control",
      lines: [
        { k: "kb", v: "private corpus" },
        { k: "access", v: "role + approval" },
        { k: "deploy", v: "dedicated / hybrid" },
      ],
      foot: "business · solutions",
    },
  },
] as const;

const startSteps = [
  {
    n: "01",
    title: "按任务选路径",
    copy: "从工作场景或下方能力路径进入，不必先懂全部模型。",
    href: "#portal-paths",
  },
  {
    n: "02",
    title: "在工作台试一次",
    copy: "用真实模型跑通结果，确认质量与成本再往下投。",
    href: "/studio",
  },
  {
    n: "03",
    title: "沉淀成可复用流程",
    copy: "保存 Skill、工作流或 API Key，让下一次从这里开始。",
    href: "/studio/skills",
  },
] as const;

const planRows = [
  {
    name: "随用随付",
    detail: "按实际 Token 与生成量结算，余额清晰可见。",
    fit: "个人探索、按量开发",
    href: "/pricing",
    cta: "查看价格",
    points: ["无月费门槛", "明细可追溯", "随时充值"],
  },
  {
    name: "会员额度",
    detail: "每日刷新可用额度，适合稳定高频创作。",
    fit: "内容与创作团队",
    href: "/pricing",
    cta: "了解会员",
    featured: true,
    points: ["每日额度刷新", "创作更划算", "优先通道"],
  },
  {
    name: "团队空间",
    detail: "项目 Key、权限与预算同屏管理，调用有归属。",
    fit: "多人协作、API 治理",
    href: "/account/team",
    cta: "创建团队",
    points: ["项目级 Key", "预算上限", "调用审计"],
  },
] as const;

const faqs = [
  {
    q: "如何创建并使用智能体？",
    a: "进入工作台选择 Skill 或从工作场景进入，按提示运行即可。满意后可保存为可复用流程，下次一键启动。",
  },
  {
    q: "Token 如何计算与充值？",
    a: "对话与生成按实际用量扣减余额。可在账户用量查看明细，在计费页充值或开通会员额度。",
  },
  {
    q: "如何获取 API Key 并管理权限？",
    a: "在账户中创建专用 Key，写入环境变量后通过 /v1/models 验证。团队场景建议按项目拆 Key，并及时轮换与撤销。",
  },
  {
    q: "是否支持私有知识库与企业部署？",
    a: "企业方案支持知识库接入、权限审批与私有化部署。可从企业页预约方案咨询，或先在个人版验证能力。",
  },
] as const;

const footerColumns = [
  {
    title: "产品",
    items: [
      { label: "AI 应用", href: "/products?cate=app" },
      { label: "工作台", href: "/studio" },
      { label: "模型 API", href: "/products?cate=api" },
      { label: "行业 Skill", href: "/studio/skills" },
    ],
  },
  {
    title: "资源",
    items: [
      { label: "产品目录", href: "/products" },
      { label: "图片创作", href: "/studio?preset=image-default" },
      { label: "视频创作", href: "/studio?preset=video-default" },
      { label: "企业方案", href: "/business" },
    ],
  },
  {
    title: "账户",
    items: [
      { label: "计费标准", href: "/pricing" },
      { label: "用量明细", href: "/account/usage" },
      { label: "API Key", href: "/account/keys" },
      { label: "团队空间", href: "/account/team" },
    ],
  },
  {
    title: "支持",
    items: [
      { label: "常见问题", href: "#portal-support" },
      { label: "联系支持", href: "#portal-support" },
      { label: "商务合作", href: "/business" },
      { label: "© 2026 Reizo", href: "/" },
    ],
  },
] as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="portal-label">{children}</p>;
}

function ArrowLink({ href = "/products" , children }: { href?: string; children: React.ReactNode }) {
  return <PortalLink href={href} className="portal-arrow-link">{children}<ChevronRight aria-hidden /></PortalLink>;
}

type ProductPath = (typeof productPaths)[number];

function PathPreviewVisual({ path, interactive }: { path: ProductPath; interactive: boolean }) {
  const { preview } = path;
  return (
    <>
      <div className="portal-ed-preview-chrome">
        <span className="portal-ed-preview-dots" aria-hidden>
          <i /><i /><i />
        </span>
        <span className="portal-ed-preview-eyebrow">{preview.eyebrow}</span>
      </div>
      <div className="portal-ed-preview-body">
        <p className="portal-ed-preview-title">{preview.title}</p>
        <dl className="portal-ed-preview-kv">
          {preview.lines.map((line) => (
            <div key={line.k}>
              <dt>{line.k}</dt>
              <dd>{line.v}</dd>
            </div>
          ))}
        </dl>
        {preview.kind === "api" ? (
          <pre className="portal-ed-preview-code" tabIndex={interactive ? 0 : -1}>
{`curl https://api.winlume.ai/v1/chat/completions \\
  -H "Authorization: Bearer $KEY" \\
  -d '{"model":"kimi-k2","stream":true}'`}
          </pre>
        ) : null}
        {preview.kind === "image" ? (
          <div className="portal-ed-preview-mosaic" aria-hidden>
            <span /><span /><span /><span />
          </div>
        ) : null}
        {preview.kind === "video" ? (
          <div className="portal-ed-preview-timeline" aria-hidden>
            <span className="is-on" /><span /><span className="is-on" /><span /><span />
          </div>
        ) : null}
        {preview.kind === "flow" ? (
          <div className="portal-ed-preview-nodes" aria-hidden>
            <span>In</span><i /><span>Model</span><i /><span>Review</span><i /><span>Out</span>
          </div>
        ) : null}
        {preview.kind === "team" ? (
          <div className="portal-ed-preview-bars" aria-hidden>
            <div><b style={{ width: "68%" }} /><em>预算</em></div>
            <div><b style={{ width: "42%" }} /><em>Key 活跃</em></div>
          </div>
        ) : null}
        {preview.kind === "biz" ? (
          <div className="portal-ed-preview-shield" aria-hidden>
            <strong>Private</strong>
            <span>知识库 · 审批 · 部署</span>
          </div>
        ) : null}
      </div>
      <div className="portal-ed-preview-foot">
        <code>{preview.foot}</code>
        <PortalLink
          href={path.href}
          className="portal-ed-preview-cta"
          tabIndex={interactive ? undefined : -1}
          aria-hidden={!interactive}
        >
          {path.cta}
          <ChevronRight aria-hidden />
        </PortalLink>
      </div>
    </>
  );
}

/**
 * Tinder / 探探 style deck:
 * - stack: front full size, next cards scaled down slightly behind
 * - switch: clone of front flies left/right with rotation, then drops
 */
const STACK_VISIBLE = 3;
const STACK_MIN_SCALE = 0.9;
const STACK_MAX_SCALE = 1;
const STACK_POW_BASE = Math.pow(STACK_MIN_SCALE / STACK_MAX_SCALE, 1 / STACK_VISIBLE);
const STACK_STEP_Y = 10;
/** Exit flight duration — match CSS `.portal-ed-preview-fly` transition. */
const SWIPE_MS = 780;
/** Min gap between accepted path changes so rapid hover doesn't stutter. */
const SWIPE_COOLDOWN_MS = 420;

type FlyAway = {
  key: number;
  pathId: ProductPath["id"];
  dir: "left" | "right";
  phase: "from" | "to";
};

function stackOrderFrom(activeId: ProductPath["id"]): ProductPath[] {
  const start = productPaths.findIndex((p) => p.id === activeId);
  if (start < 0) return [...productPaths];
  return [...productPaths.slice(start), ...productPaths.slice(0, start)];
}

function stackCardStyle(depth: number): CSSProperties {
  if (depth >= STACK_VISIBLE) {
    return {
      opacity: 0,
      transform: `translate3d(0, ${STACK_STEP_Y * STACK_VISIBLE}px, 0) scale(${STACK_MIN_SCALE})`,
      zIndex: 0,
      pointerEvents: "none",
    };
  }
  const scale = STACK_MAX_SCALE * STACK_POW_BASE ** depth;
  const ty = STACK_STEP_Y * depth;
  const opacity = depth === 0 ? 1 : Math.max(0.75, 1 - depth * 0.12);
  return {
    opacity,
    transform: `translate3d(0, ${ty}px, 0) scale(${scale})`,
    zIndex: 20 - depth,
    pointerEvents: depth === 0 ? "auto" : "none",
  };
}

function swipeDirection(fromId: ProductPath["id"], toId: ProductPath["id"]): "left" | "right" {
  const from = productPaths.findIndex((p) => p.id === fromId);
  const to = productPaths.findIndex((p) => p.id === toId);
  if (from < 0 || to < 0 || from === to) return "left";
  const n = productPaths.length;
  const forward = (to - from + n) % n;
  const backward = (from - to + n) % n;
  // Prefer the shorter arc; ties swipe left (探探默认刷走方向)
  return forward <= backward ? "left" : "right";
}

export default function ModelMarket() {
  const router = useRouter();
  const { account, balanceConfig } = useModals();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [featuredSlides, setFeaturedSlides] = useState<FeaturedSlide[]>(FEATURED_SLIDES);
  const [featuredPaused, setFeaturedPaused] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activePathId, setActivePathId] = useState<ProductPath["id"]>("api");
  const [flyAways, setFlyAways] = useState<FlyAway[]>([]);
  const flyKeyRef = useRef(0);
  const flyTimersRef = useRef<number[]>([]);
  const activePathIdRef = useRef<ProductPath["id"]>("api");
  const lastSwipeAtRef = useRef(0);
  const pendingPathRef = useRef<ProductPath["id"] | null>(null);
  const cooldownTimerRef = useRef<number | null>(null);
  const [notice, setNotice] = useState("");
  const [chatwootReady, setChatwootReady] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [onboardingPlacement, setOnboardingPlacement] = useState<OnboardingPlacement | null>(null);
  const [activeApiId, setActiveApiId] = useState<string | null>(null);
  const apiFlyoutCloseTimerRef = useRef<number | null>(null);
  const balance = formatBalance(account?.quota, balanceConfig);
  const activePath = productPaths.find((path) => path.id === activePathId) ?? productPaths[0];
  const stackPaths = stackOrderFrom(activePath.id).slice(0, STACK_VISIBLE);

  useEffect(() => {
    activePathIdRef.current = activePathId;
  }, [activePathId]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portal/content", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((content: { carousel?: Array<{ id: string; imageUrl: string; alt: string; href: string; enabled?: boolean }> } | null) => {
        const slides = (content?.carousel ?? []).filter((slide) => slide.enabled !== false && slide.imageUrl && slide.alt).map((slide) => ({ id: slide.id, src: slide.imageUrl, alt: slide.alt, href: slide.href || "/products?cate=api" }));
        if (!cancelled && slides.length) { setFeaturedSlides(slides); setFeaturedIndex(0); }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(PORTAL_ONBOARDING_STORAGE_KEY)) return;
    } catch {
      // Private browsing can disable storage; the guide still works for this visit.
    }

    const timer = window.setTimeout(() => setOnboardingStep(0), 520);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (onboardingStep == null) {
      setOnboardingPlacement(null);
      return;
    }

    const step = onboardingSteps[onboardingStep];
    const selector = `[data-onboarding-target="${step.target}"]`;
    const updatePlacement = () => {
      const target = document.querySelector(selector);
      if (!target) return;

      const rect = target.getBoundingClientRect();
      const cardWidth = Math.min(344, window.innerWidth - 32);
      const cardHeight = 278;
      const targetOnRight = step.target === "tools";
      const preferredLeft = targetOnRight ? rect.left - cardWidth - 28 : rect.right + 28;
      const left = Math.max(16, Math.min(preferredLeft, window.innerWidth - cardWidth - 16));
      const top = Math.max(84, Math.min(rect.top + Math.min(34, rect.height * .18), window.innerHeight - cardHeight - 16));
      const targetX = targetOnRight ? rect.left : rect.right;
      const targetY = Math.max(74, Math.min(rect.top + rect.height * .5, window.innerHeight - 42));
      const lineStartX = targetOnRight ? left + cardWidth : left;
      const lineStartY = top + 132;
      const dx = targetX - lineStartX;
      const dy = targetY - lineStartY;

      setOnboardingPlacement({
        left,
        top,
        lineLeft: lineStartX,
        lineTop: lineStartY,
        lineWidth: Math.max(24, Math.hypot(dx, dy)),
        lineAngle: Math.atan2(dy, dx) * (180 / Math.PI),
      });
    };

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [onboardingStep]);

  const stepFeatured = useCallback((delta: number) => {
    setFeaturedIndex((current) => {
      const n = featuredSlides.length;
      return (current + delta + n) % n;
    });
  }, [featuredSlides.length]);

  useEffect(() => {
    if (featuredPaused || featuredSlides.length <= 1) return;
    const timer = window.setInterval(() => stepFeatured(1), FEATURED_AUTO_MS);
    return () => window.clearInterval(timer);
  }, [featuredPaused, featuredSlides.length, stepFeatured]);

  useEffect(() => {
    return () => {
      flyTimersRef.current.forEach((id) => window.clearTimeout(id));
      flyTimersRef.current = [];
      if (cooldownTimerRef.current != null) {
        window.clearTimeout(cooldownTimerRef.current);
      }
      if (apiFlyoutCloseTimerRef.current != null) {
        window.clearTimeout(apiFlyoutCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onReady = () => setChatwootReady(true);
    window.addEventListener("chatwoot:ready", onReady);

    if (window.$chatwoot) {
      onReady();
    }

    if (!window.__reizoChatwootStarted) {
      window.__reizoChatwootStarted = true;
      // Reuse the portal's compact "客服" control as the only launcher.
      window.chatwootSettings = { ...window.chatwootSettings, hideMessageBubble: true };
      const loadWidget = () => window.chatwootSDK?.run({
        websiteToken: CHATWOOT_WEBSITE_TOKEN,
        baseUrl: CHATWOOT_BASE_URL,
      });
      const script = document.getElementById("chatwoot-sdk") as HTMLScriptElement | null;

      if (script) {
        if (window.chatwootSDK) loadWidget();
        else script.addEventListener("load", loadWidget, { once: true });
      } else {
        const widgetScript = document.createElement("script");
        widgetScript.id = "chatwoot-sdk";
        widgetScript.src = `${CHATWOOT_BASE_URL}/packs/js/sdk.js`;
        widgetScript.async = true;
        widgetScript.onload = loadWidget;
        document.head.appendChild(widgetScript);
      }
    }

    return () => window.removeEventListener("chatwoot:ready", onReady);
  }, []);

  function commitPathSwipe(nextId: ProductPath["id"]) {
    const fromId = activePathIdRef.current;
    if (nextId === fromId) return;

    const dir = swipeDirection(fromId, nextId);
    const key = ++flyKeyRef.current;

    lastSwipeAtRef.current = Date.now();
    activePathIdRef.current = nextId;
    setFlyAways((prev) => [...prev, { key, pathId: fromId, dir, phase: "from" }]);
    setActivePathId(nextId);

    // Double rAF: paint at rest, then apply exit transform for a real transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setFlyAways((prev) =>
          prev.map((item) => (item.key === key ? { ...item, phase: "to" } : item)),
        );
      });
    });

    const timer = window.setTimeout(() => {
      setFlyAways((prev) => prev.filter((item) => item.key !== key));
      flyTimersRef.current = flyTimersRef.current.filter((id) => id !== timer);
    }, SWIPE_MS + 80);
    flyTimersRef.current.push(timer);
  }

  function selectPath(nextId: ProductPath["id"]) {
    if (nextId === activePathIdRef.current && pendingPathRef.current == null) return;
    if (nextId === activePathIdRef.current) {
      pendingPathRef.current = null;
      return;
    }

    const elapsed = Date.now() - lastSwipeAtRef.current;
    if (elapsed < SWIPE_COOLDOWN_MS) {
      // Coalesce rapid hovers onto the latest target; flush after cooldown
      pendingPathRef.current = nextId;
      if (cooldownTimerRef.current == null) {
        cooldownTimerRef.current = window.setTimeout(() => {
          cooldownTimerRef.current = null;
          const pending = pendingPathRef.current;
          pendingPathRef.current = null;
          if (pending && pending !== activePathIdRef.current) {
            commitPathSwipe(pending);
          }
        }, SWIPE_COOLDOWN_MS - elapsed);
      }
      return;
    }

    pendingPathRef.current = null;
    commitPathSwipe(nextId);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    setSubmittedQuery(normalized);
    if (!normalized) {
      setNotice("请输入任务、模型或应用名称");
      window.setTimeout(() => setNotice(""), 1800);
      return;
    }
    router.push(`/products?cate=app&q=${encodeURIComponent(normalized)}`);
  }

  function openSupportChat() {
    if (window.$chatwoot) {
      window.$chatwoot.toggle("open");
      return;
    }
    setNotice(chatwootReady ? "在线客服暂时不可用，请稍后重试" : "在线客服正在连接，请稍后再试");
  }

  function completeOnboarding() {
    try {
      window.localStorage.setItem(PORTAL_ONBOARDING_STORAGE_KEY, "complete");
    } catch {
      // Keep the dismissed state for the active React session if storage is unavailable.
    }
    setOnboardingStep(null);
  }

  function changeOnboardingStep(next: number) {
    if (next >= onboardingSteps.length) {
      completeOnboarding();
      return;
    }
    setOnboardingStep(Math.max(0, next));
  }

  // The supplier panel is deliberately positioned outside its compact row. A
  // short exit grace period keeps it open while the cursor crosses that visual
  // boundary, preventing the open/close loop that made lower rows (notably RAG)
  // flicker.
  function clearApiFlyoutCloseTimer() {
    if (apiFlyoutCloseTimerRef.current == null) return;
    window.clearTimeout(apiFlyoutCloseTimerRef.current);
    apiFlyoutCloseTimerRef.current = null;
  }

  function openApiFlyout(id: string) {
    clearApiFlyoutCloseTimer();
    setActiveApiId(id);
  }

  function scheduleApiFlyoutClose() {
    clearApiFlyoutCloseTimer();
    apiFlyoutCloseTimerRef.current = window.setTimeout(() => {
      setActiveApiId(null);
      apiFlyoutCloseTimerRef.current = null;
    }, 180);
  }

  return (
    <div className="portal-home">
      <div className="portal-frame">
        <PortalHeader />

        <div className="portal-search-row">
          <section className={`portal-search-card${onboardingStep === 0 ? " is-onboarding-target" : ""}`} data-onboarding-target="agent" aria-labelledby="portal-search-title">
            <Image className="portal-search-waves" src="/figma-home/search-waves.svg" alt="" fill sizes="710px" priority />
            <div className="portal-search-content">
              <div className="portal-search-heading">
                <div>
                  <span className="portal-search-kicker">REIZO CAPABILITY DESK</span>
                  <h1 id="portal-search-title">找到适合你的 <em>AI</em> 能力</h1>
                </div>
                <div className="portal-search-proof" aria-label="平台能力规模">
                  <span><strong>300+</strong><small>应用工具</small></span>
                  <i aria-hidden />
                  <span><strong>2600+</strong><small>Skills</small></span>
                </div>
              </div>
              <div className="portal-search-form-row">
                <form className="portal-search-form" onSubmit={submitSearch}>
                  <Search aria-hidden />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索任务、应用、模型或 API，例如：产品图、财务分析、PPT" aria-label="搜索 AI 能力" />
                  <HeroButton type="submit" variant="primary" size="md" className="portal-hero-search-button"><Search aria-hidden />搜索</HeroButton>
                </form>
                <PortalLink href="/studio" className="portal-workbench-button"><LayoutGrid aria-hidden />进入工作台<ChevronRight aria-hidden /></PortalLink>
              </div>
              <div className="portal-chip-list" aria-label="热门能力">
                {searchSuggestions.map(({ label, icon: Icon }) => (
                  <HeroButton key={label} type="button" variant={query === label ? "primary" : "tertiary"} size="sm" className="portal-hero-chip" onClick={() => { setQuery(label); setSubmittedQuery(label); router.push(`/products?cate=app&q=${encodeURIComponent(label)}`); }}><Icon aria-hidden />{label}</HeroButton>
                ))}
                <HeroButton type="button" variant="tertiary" size="sm" className="portal-hero-chip" onClick={() => router.push("/products?cate=app")}><LayoutGrid aria-hidden />更多</HeroButton>
              </div>
            </div>
          </section>

          <article className="portal-enterprise-card portal-search-aside" aria-labelledby="portal-enterprise-title">
            <SectionLabel>ENTERPRISE</SectionLabel>
            <h2 id="portal-enterprise-title">企业 AI 部署</h2>
            <p>私有化部署、系统集成与专属服务，助力企业安全高效落地 AI。</p>
            <PortalLink href="/business" className="portal-enterprise-button">进入企业版<ChevronRight aria-hidden /></PortalLink>
            <Image src="/figma-home/building.svg" alt="" width={145} height={116} />
          </article>
        </div>

        {submittedQuery && <p className="portal-search-result" role="status">已为你准备“{submittedQuery}”相关能力，先从下面的工具分类开始。</p>}

        <div className="portal-discovery-grid">
          <aside className={`portal-api-card${onboardingStep === 1 ? " is-onboarding-target" : ""}`} data-onboarding-target="api" aria-labelledby="portal-api-title">
            <div className="portal-api-card-head">
              <h2 id="portal-api-title">API模型</h2>
              <ArrowLink href="/products?cate=api">查看全部API模型</ArrowLink>
            </div>
            <div className="portal-api-list" role="list">
              {apiCategories.map((item) => (
                <div
                  key={item.id}
                  className="portal-api-row"
                  role="listitem"
                  tabIndex={0}
                  onMouseEnter={() => openApiFlyout(item.id)}
                  onMouseLeave={scheduleApiFlyoutClose}
                  onFocusCapture={() => openApiFlyout(item.id)}
                  onBlurCapture={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      clearApiFlyoutCloseTimer();
                      setActiveApiId(null);
                    }
                  }}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a")) return;
                    setActiveApiId((current) => current === item.id ? null : item.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    setActiveApiId((current) => current === item.id ? null : item.id);
                  }}
                >
                  <PortalLink href={item.href} className="portal-api-row-label">
                    <AssetIcon src={item.icon} />
                    <span>{item.label}</span>
                  </PortalLink>
                  <span className="portal-api-row-divider" aria-hidden />
                  <div className="portal-api-brands" aria-label={`${item.label}可用模型：${item.brands.map((brand) => brand.label).join("、")}`}>
                    {item.brands.slice(0, 4).map((brand) => (
                      <PortalLink key={brand.label} href={brand.href} className="portal-api-brand">
                        {brand.label}
                      </PortalLink>
                    ))}
                  </div>
                  <PortalLink href={item.href} className="portal-api-row-more" aria-label={`${item.label}更多`}>
                    <ChevronRight aria-hidden />
                  </PortalLink>
                  {activeApiId === item.id ? (
                    <div
                      className="portal-api-touch-card"
                      role="dialog"
                      aria-label={`${item.label}热门模型`}
                      onMouseEnter={clearApiFlyoutCloseTimer}
                      onMouseLeave={scheduleApiFlyoutClose}
                    >
                      <div className="portal-api-touch-head">
                        <div><AssetIcon src={item.icon} /><strong>{item.label}</strong><span>{item.brands.length}+ 个热门能力</span></div>
                        <PortalLink href={item.href}>查看全部<ChevronRight aria-hidden /></PortalLink>
                      </div>
                      <div className="portal-api-touch-grid">
                        {item.brands.map((brand) => (
                          <PortalLink key={brand.label} href={brand.href}>
                            <span><Image src={brand.icon} alt="" width={28} height={28} unoptimized /></span>
                            <strong>{brand.label}</strong>
                            <small>{brand.description}</small>
                          </PortalLink>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </aside>

          <section className={`portal-tools-card${onboardingStep === 2 ? " is-onboarding-target" : ""}`} data-onboarding-target="tools" aria-labelledby="portal-tools-title">
            <div className="portal-tools-head">
              <h2 id="portal-tools-title">应用工具</h2>
              <ArrowLink href="/products?cate=app">查看全部工具</ArrowLink>
            </div>
            <div className="portal-tools-grid">
              {toolApplications.map((tool) => (
                <PortalLink href={tool.href} className="portal-tool-card" key={tool.label}>
                  <AssetIcon src={tool.icon} />
                  <strong>{tool.label}</strong>
                  <span>{tool.detail}</span>
                </PortalLink>
              ))}
            </div>
          </section>

          <article
            className="portal-featured-card portal-featured-carousel"
            aria-roledescription="carousel"
            aria-label="Model Review 精选轮播"
            onMouseEnter={() => setFeaturedPaused(true)}
            onMouseLeave={() => setFeaturedPaused(false)}
            onFocusCapture={() => setFeaturedPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setFeaturedPaused(false);
              }
            }}
          >
            <div className="portal-featured-track">
              {featuredSlides.map((slide, index) => (
                <PortalLink
                  key={slide.id}
                  href={slide.href}
                  className={`portal-featured-slide${index === featuredIndex ? " is-active" : ""}`}
                  aria-hidden={index !== featuredIndex}
                  tabIndex={index === featuredIndex ? 0 : -1}
                >
                  <Image
                    className="portal-featured-slide-img"
                    src={slide.src}
                    alt={slide.alt}
                    fill
                    sizes="(max-width: 1100px) 100vw, 812px"
                    priority={index === 0}
                    unoptimized
                  />
                </PortalLink>
              ))}
            </div>

            <button
              type="button"
              className="portal-featured-nav is-prev"
              aria-label="上一张精选"
              onClick={() => stepFeatured(-1)}
            >
              <ChevronLeft aria-hidden />
            </button>
            <button
              type="button"
              className="portal-featured-nav is-next"
              aria-label="下一张精选"
              onClick={() => stepFeatured(1)}
            >
              <ChevronRight aria-hidden />
            </button>

            <div className="portal-featured-dots" role="tablist" aria-label="精选页码">
              {featuredSlides.map((slide, index) => (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={index === featuredIndex}
                  aria-label={`第 ${index + 1} 张：${slide.alt}`}
                  className={index === featuredIndex ? "is-active" : ""}
                  onClick={() => setFeaturedIndex(index)}
                />
              ))}
            </div>
          </article>

          <div className="portal-side-cards">
            <section
              className="portal-side-card portal-usage-card portal-usage-card-link"
              aria-labelledby="portal-usage-title"
              role="link"
              tabIndex={0}
              onClick={() => router.push("/account")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push("/account");
                }
              }}
            >
              <div className="portal-card-heading"><Image src="/figma-home/usage-icon.svg" alt="" width={20} height={20} /><h2 id="portal-usage-title">账户概览</h2></div>
              <div className="portal-usage-stats">
                <div><span>余额</span><strong>{balance === "余额同步中" ? "¥168.20" : balance}</strong></div>
                <div><span>已消耗 Token</span><strong>1.24M</strong></div>
                <div className="portal-membership-quota"><span><em>Free</em>会员剩余额度</span><strong>80%</strong></div>
              </div>
              <Link href="/account" className="portal-arrow-link" onClick={(event) => event.stopPropagation()}>进入个人中心<ChevronRight aria-hidden /></Link>
            </section>
          </div>
        </div>

        <section className="portal-app-showcase portal-app-showcase-v2" aria-labelledby="portal-app-showcase-title">
          <div className="portal-app-showcase-head">
            <div><p>APPLICATIONS</p><h2 id="portal-app-showcase-title">把想法直接变成成果</h2></div>
            <ArrowLink href="/products?cate=app">查看全部应用</ArrowLink>
          </div>
          <Tabs defaultSelectedKey="popular" variant="secondary" className="portal-app-tabs">
            <Tabs.ListContainer className="portal-app-tabs-list-container">
              <Tabs.List aria-label="应用工具分组" className="portal-app-tabs-list">
                <Tabs.Tab id="popular" className="portal-app-tab">热门应用<Tabs.Indicator /></Tabs.Tab>
                <Tabs.Tab id="latest" className="portal-app-tab">最新上架<Tabs.Indicator /></Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
            <Tabs.Panel id="popular" className="portal-app-tab-panel">
              <div className="portal-featured-app-grid">
                {portalApplicationShowcase.slice(0, 1).map((app) => (
                  <PortalLink href={app.href} className="portal-featured-app-card" key={app.title}>
                    <ApplicationResultPreview kind={app.preview} />
                    <span className="portal-featured-app-copy"><em>FEATURED OUTPUT</em><strong>{app.title}</strong><small>{app.detail}</small></span>
                  </PortalLink>
                ))}
                <div className="portal-app-support-grid">
                  {portalApplicationShowcase.slice(1, 5).map((app) => (
                    <PortalLink href={app.href} className="portal-app-support-card" key={app.title}>
                      <ApplicationResultPreview kind={app.preview} />
                      <span><strong>{app.title}</strong><small>{app.detail}</small></span>
                    </PortalLink>
                  ))}
                </div>
              </div>
            </Tabs.Panel>
            <Tabs.Panel id="latest" className="portal-app-tab-panel">
              <div className="portal-app-showcase-grid is-all">
                {portalApplicationShowcase.slice(5).map((app) => (
                  <HeroCard variant="secondary" className="portal-app-showcase-item" key={app.title}>
                    <PortalLink href={app.href} className="portal-app-showcase-card">
                      <ApplicationResultPreview kind={app.preview} />
                      <span className="portal-app-showcase-new">NEW</span>
                      <strong>{app.title}</strong><p>{app.detail}</p>
                    </PortalLink>
                  </HeroCard>
                ))}
              </div>
            </Tabs.Panel>
          </Tabs>
        </section>

        <section className="portal-bottom-explore portal-system-rail" aria-labelledby="portal-bottom-explore-title">
          <div className="portal-bottom-explore-head"><div><p>MORE WITH REIZO</p><h2 id="portal-bottom-explore-title">探索更多 REIZO 能力</h2></div></div>
          <div className="portal-system-track">{portalCapabilityCards.map((card) => <PortalLink href={card.href} className="portal-system-stage" key={card.title}><CapabilityEvidence kind={card.evidence} /><span><em>{card.badge}</em><strong>{card.title}</strong><small>{card.detail}</small></span></PortalLink>)}</div>
          <HeroCard variant="tertiary" className="portal-bottom-help"><span><CircleHelp aria-hidden />没有找到合适的应用或技能？告诉我们你的使用场景，我们为你定制解决方案。</span><PortalLink href="/business" className="portal-bottom-help-link">提交需求<ChevronRight aria-hidden /></PortalLink></HeroCard>
          <footer className="portal-bottom-footer"><div className="portal-bottom-brand"><strong><Image className="portal-footer-mark" src="/brand/reizo-mark.png" alt="" width={26} height={26} />REIZO</strong><p>从 AI 能力到智能体，每一步都更简单。</p><small>© 2026 Reizo. All rights reserved.</small></div>{footerColumns.map((group) => <div key={group.title}><h3>{group.title}</h3>{group.items.slice(0, 3).map((item) => <PortalLink href={item.href} key={item.label}>{item.label}</PortalLink>)}</div>)}<div><h3>关注我们</h3><span className="portal-bottom-social">𝕏　in　◉　✉</span></div></footer>
        </section>

        <section className="portal-industry-section" aria-labelledby="portal-industry-title">
          <div className="portal-section-header"><div><h2 id="portal-industry-title">工作场景</h2><p>按任务开始，快速找到匹配的生产级 Skill</p></div><ArrowLink href="/studio/skills">探索全部工具</ArrowLink></div>
          <div className="portal-industry-grid">{workScenes.map((item) => <PortalLink href={item.href} className="portal-industry-card" key={item.id}><AssetIcon src={item.icon} /><span>{item.label}</span><ChevronRight aria-hidden /></PortalLink>)}</div>
        </section>

        <div className="portal-ed">
          <section className="portal-ed-stage" id="portal-paths" aria-labelledby="portal-paths-title">
            <div className="portal-ed-stage-glow" aria-hidden />
            <div className="portal-ed-stage-head">
              <p className="portal-ed-kicker">Product paths</p>
              <h2 id="portal-paths-title">选一条路径，先看见产品，再决定进入</h2>
            </div>

            <div className="portal-ed-stage-body">
              <ul className="portal-ed-path-list" role="listbox" aria-label="产品路径" aria-activedescendant={`path-${activePath.id}`}>
                {productPaths.map((path) => {
                  const active = path.id === activePath.id;
                  return (
                    <li key={path.id} id={`path-${path.id}`} role="option" aria-selected={active}>
                      <div
                        className={`portal-ed-path-row${active ? " is-active" : ""}`}
                        onPointerEnter={() => selectPath(path.id)}
                        onFocus={() => selectPath(path.id)}
                      >
                        <span className="portal-ed-path-index" aria-hidden>{path.index}</span>
                        <button
                          type="button"
                          className="portal-ed-path-select"
                          onClick={() => selectPath(path.id)}
                          aria-label={`预览 ${path.meta}`}
                        >
                          <span className="portal-ed-path-meta">{path.meta}</span>
                          <strong>{path.title}</strong>
                          <span className="portal-ed-path-outcome">{path.outcome}</span>
                        </button>
                        <PortalLink href={path.href} className="portal-ed-path-go">
                          {path.cta}
                          <ChevronRight aria-hidden />
                        </PortalLink>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <aside className="portal-ed-preview" aria-live="polite" aria-label={`${activePath.meta} 产品预览`}>
                <div className="portal-ed-preview-stack">
                  {stackPaths.map((path, depth) => {
                    const isFront = depth === 0;
                    return (
                      <div
                        key={path.id}
                        className={`portal-ed-preview-card kind-${path.preview.kind}${isFront ? " is-front" : ""}`}
                        data-depth={depth}
                        style={stackCardStyle(depth)}
                        aria-hidden={!isFront}
                      >
                        <PathPreviewVisual path={path} interactive={isFront} />
                      </div>
                    );
                  })}
                  {flyAways.map((fly) => {
                    const path = productPaths.find((entry) => entry.id === fly.pathId);
                    if (!path) return null;
                    return (
                      <div
                        key={fly.key}
                        className={[
                          "portal-ed-preview-card",
                          "portal-ed-preview-fly",
                          `kind-${path.preview.kind}`,
                          fly.phase === "to" ? `is-exit-${fly.dir}` : "is-exit-from",
                        ].join(" ")}
                        aria-hidden
                      >
                        <PathPreviewVisual path={path} interactive={false} />
                      </div>
                    );
                  })}
                </div>
              </aside>
            </div>
          </section>

          <section className="portal-ed-steps" aria-labelledby="portal-steps-title">
            <div className="portal-ed-steps-inner">
              <div className="portal-ed-section-head portal-ed-section-head-light">
                <p className="portal-ed-kicker portal-ed-kicker-light">How it works</p>
                <h2 id="portal-steps-title">三步，把 AI 用进日常工作</h2>
                <p>发现、验证、沉淀。每一步都能直接点进去。</p>
              </div>
              <ol className="portal-ed-step-list">
                {startSteps.map((step) => (
                  <li key={step.n}>
                    <PortalLink href={step.href} className="portal-ed-step">
                      <span className="portal-ed-step-n">{step.n}</span>
                      <strong>{step.title}</strong>
                      <p>{step.copy}</p>
                      <span className="portal-ed-step-link">
                        继续
                        <ChevronRight aria-hidden />
                      </span>
                    </PortalLink>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="portal-ed-plans" aria-labelledby="portal-plans-title">
            <div className="portal-ed-section-head">
              <p className="portal-ed-kicker">Pricing</p>
              <h2 id="portal-plans-title">按使用方式开始，而不是先买席位</h2>
              <p>余额与额度透明；需要协作时再开团队空间。</p>
            </div>
            <div className="portal-ed-plan-grid">
              {planRows.map((plan) => (
                <article
                  className={`portal-ed-plan-card${"featured" in plan && plan.featured ? " is-featured" : ""}`}
                  key={plan.name}
                >
                  {"featured" in plan && plan.featured ? (
                    <span className="portal-ed-plan-badge">常用</span>
                  ) : null}
                  <h3>{plan.name}</h3>
                  <p className="portal-ed-plan-detail">{plan.detail}</p>
                  <p className="portal-ed-plan-fit">{plan.fit}</p>
                  <ul>
                    {plan.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                  <PortalLink href={plan.href} className="portal-ed-plan-cta">
                    {plan.cta}
                    <ChevronRight aria-hidden />
                  </PortalLink>
                </article>
              ))}
            </div>
          </section>

          <section className="portal-ed-support" id="portal-support" aria-labelledby="portal-support-title">
            <div className="portal-ed-support-panel">
              <div className="portal-ed-support-intro">
                <p className="portal-ed-kicker">Support</p>
                <h2 id="portal-support-title">问题先查这里，卡住再找人</h2>
                <p>从创建 Key 到企业部署，把常见决策写清楚。</p>
                <button type="button" className="portal-ed-support-cta" onClick={openSupportChat}>
                  联系技术支持
                  <ChevronRight aria-hidden />
                </button>
              </div>
              <div className="portal-ed-faq">
                {faqs.map((item, index) => {
                  const open = openFaq === index;
                  return (
                    <div className={`portal-ed-faq-item${open ? " is-open" : ""}`} key={item.q}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenFaq(open ? null : index)}
                      >
                        <span>{item.q}</span>
                        <span aria-hidden className="portal-ed-faq-mark">{open ? "−" : "+"}</span>
                      </button>
                      {open ? <p>{item.a}</p> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <footer className="portal-ed-footer">
            <div className="portal-ed-footer-brand">
              <strong><Image className="portal-footer-mark" src="/brand/reizo-mark.png" alt="" width={26} height={26} />Reizo</strong>
              <p>把 AI 能力放进每天的工作里。</p>
            </div>
            {footerColumns.map((group) => (
              <div className="portal-ed-footer-col" key={group.title}>
                <h2>{group.title}</h2>
                {group.items.map((item) => (
                  <PortalLink href={item.href} key={item.label}>{item.label}</PortalLink>
                ))}
              </div>
            ))}
          </footer>
        </div>
        </div>

        {onboardingStep != null ? (
          <div className="portal-onboarding" role="dialog" aria-modal="true" aria-labelledby="portal-onboarding-title" aria-describedby="portal-onboarding-description">
            <div className="portal-onboarding-scrim" aria-hidden />
            {onboardingPlacement ? (
              <span
                className="portal-onboarding-line"
                aria-hidden
                style={{
                  left: onboardingPlacement.lineLeft,
                  top: onboardingPlacement.lineTop,
                  width: onboardingPlacement.lineWidth,
                  transform: `rotate(${onboardingPlacement.lineAngle}deg)`,
                }}
              />
            ) : null}
            <section
              className="portal-onboarding-card"
              style={onboardingPlacement ? { left: onboardingPlacement.left, top: onboardingPlacement.top } : undefined}
            >
              <div className="portal-onboarding-progress">{onboardingStep + 1}/{onboardingSteps.length}</div>
              <div className="portal-onboarding-title-row">
                <span className={`portal-onboarding-icon is-${onboardingSteps[onboardingStep].target}`} aria-hidden>
                  {onboardingStep === 0 ? <LayoutGrid /> : onboardingStep === 1 ? <Search /> : <Crown />}
                </span>
                <h2 id="portal-onboarding-title">{onboardingSteps[onboardingStep].title}</h2>
              </div>
              <p className="portal-onboarding-lead">{onboardingSteps[onboardingStep].lead}</p>
              <p id="portal-onboarding-description" className="portal-onboarding-copy">{onboardingSteps[onboardingStep].body}</p>
              <div className="portal-onboarding-dots" aria-label={`第 ${onboardingStep + 1} 步，共 ${onboardingSteps.length} 步`}>
                {onboardingSteps.map((step, index) => <i key={step.target} className={index === onboardingStep ? "is-active" : ""} />)}
              </div>
              <div className="portal-onboarding-actions">
                <button type="button" className="portal-onboarding-skip" onClick={completeOnboarding}>跳过引导</button>
                <div>
                  {onboardingStep > 0 ? <button type="button" className="portal-onboarding-back" onClick={() => changeOnboardingStep(onboardingStep - 1)}>上一步</button> : null}
                  <button type="button" className="portal-onboarding-next" onClick={() => changeOnboardingStep(onboardingStep + 1)}>{onboardingStep === onboardingSteps.length - 1 ? "开始使用" : "下一步"}</button>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        <aside className="portal-floating-tools" aria-label="快捷工具"><button type="button" onClick={openSupportChat}><CircleHelp aria-hidden /><span>客服</span></button><span className="portal-floating-divider" aria-hidden /><button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp aria-hidden /><span>顶部</span></button></aside>
      <div className={`portal-notice ${notice ? "is-visible" : ""}`} role="status" aria-live="polite">{notice}</div>
    </div>
  );
}
