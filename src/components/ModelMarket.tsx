"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, ChevronLeft, ChevronRight, CircleHelp, Crown, LayoutGrid, Search, ArrowUp } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useModals } from "@/components/providers";
import { formatBalance } from "@/lib/account";
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

type AssetIconProps = { src: string; alt?: string; className?: string };

function AssetIcon({ src, alt = "", className }: AssetIconProps) {
  return <Image src={src} alt={alt} width={38} height={38} className={className} />;
}

type PortalLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  tabIndex?: number;
  "aria-hidden"?: boolean;
};

function PortalLink({ href, children, className, onClick, tabIndex, "aria-hidden": ariaHidden }: PortalLinkProps) {
  return (
    <Link href={href} className={className} onClick={onClick} tabIndex={tabIndex} aria-hidden={ariaHidden}>
      {children}
    </Link>
  );
}

type ApiBrandLink = {
  label: string;
  href: string;
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

/** Max brand chips per row (homepage density). */
const API_BRAND_LIMIT = 5;

/** Hardcoded Model Review carousel slides (generated banners in public/). */
const FEATURED_SLIDES = [
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

/** Home API category rows: hardcoded marketplace brands (no generic filler labels). */
const apiCategories: readonly ApiCategory[] = [
  {
    id: "llm",
    label: "语言推理",
    icon: "/figma-home/icon-chat.svg",
    href: "/products?cate=api",
    brands: [
      { label: "OpenAI", href: "/products?cate=api" },
      { label: "Anthropic", href: "/products?cate=api" },
      { label: "Gemini", href: "/products?cate=api" },
      { label: "Grok", href: "/products?cate=api" },
      { label: "通义千问", href: "/products?cate=api" },
    ].slice(0, API_BRAND_LIMIT),
  },
  {
    id: "image-processing",
    label: "图像处理",
    icon: "/figma-home/icon-image.svg",
    href: "/studio?preset=image-default",
    brands: [
      { label: "DALL·E", href: "/products?cate=api" },
      { label: "Recraft", href: "/products?cate=api" },
      { label: "Vectorizer.AI", href: "/products?cate=api" },
      { label: "阶跃星辰", href: "/products?cate=api" },
      { label: "BRIA", href: "/products?cate=api" },
      { label: "Bagel", href: "/products?cate=api" },
    ].slice(0, API_BRAND_LIMIT),
  },
  {
    id: "video",
    label: "视频处理",
    icon: "/figma-home/icon-video.svg",
    href: "/studio?preset=video-default",
    brands: [
      { label: "OpenAI", href: "/products?cate=api" },
      { label: "Luma AI", href: "/products?cate=api" },
      { label: "Genmo", href: "/products?cate=api" },
      { label: "昆仑万维", href: "/products?cate=api" },
    ].slice(0, API_BRAND_LIMIT),
  },
  {
    id: "audio",
    label: "音频处理",
    icon: "/figma-home/icon-voice.svg",
    href: "/products?cate=api",
    brands: [
      { label: "Whisper", href: "/products?cate=api" },
      { label: "ElevenLabs", href: "/products?cate=api" },
      { label: "MiniMax", href: "/products?cate=api" },
      { label: "Suno", href: "/products?cate=api" },
    ].slice(0, API_BRAND_LIMIT),
  },
  {
    id: "info",
    label: "信息检索",
    icon: "/figma-home/icon-search.svg",
    href: "/products?cate=api",
    brands: [
      { label: "Jina", href: "/products?cate=api" },
      { label: "Exa", href: "/products?cate=api" },
      { label: "博查AI", href: "/products?cate=api" },
      { label: "Search1API", href: "/products?cate=api" },
    ].slice(0, API_BRAND_LIMIT),
  },
  {
    id: "rag",
    label: "RAG知识库",
    icon: "/figma-home/icon-db.svg",
    href: "/products?cate=api",
    brands: [
      { label: "OpenAI", href: "/products?cate=api" },
      { label: "Jina", href: "/products?cate=api" },
      { label: "国产模型", href: "/products?cate=api" },
      { label: "硅基流动", href: "/products?cate=api" },
      { label: "Google", href: "/products?cate=api" },
    ].slice(0, API_BRAND_LIMIT),
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
    id: "workflow",
    index: "04",
    title: "把重复任务收成可运行的流程",
    outcome: "模型、工具与人工审核连成模板，一点即跑。",
    meta: "工作流",
    href: "/studio/skills",
    cta: "查看模板",
    preview: {
      kind: "flow" as const,
      eyebrow: "Workflow",
      title: "Content review pack",
      lines: [
        { k: "nodes", v: "intake → model → review" },
        { k: "status", v: "ready to run" },
        { k: "retry", v: "on failure" },
      ],
      foot: "skills · packs",
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
  const { account, balanceConfig, openLogin } = useModals();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [featuredIndex, setFeaturedIndex] = useState(0);
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
  const balance = formatBalance(account?.quota, balanceConfig);
  const activePath = productPaths.find((path) => path.id === activePathId) ?? productPaths[0];
  const stackPaths = stackOrderFrom(activePath.id).slice(0, STACK_VISIBLE);

  useEffect(() => {
    activePathIdRef.current = activePathId;
  }, [activePathId]);

  const stepFeatured = useCallback((delta: number) => {
    setFeaturedIndex((current) => {
      const n = FEATURED_SLIDES.length;
      return (current + delta + n) % n;
    });
  }, []);

  useEffect(() => {
    if (featuredPaused || FEATURED_SLIDES.length <= 1) return;
    const timer = window.setInterval(() => stepFeatured(1), FEATURED_AUTO_MS);
    return () => window.clearInterval(timer);
  }, [featuredPaused, stepFeatured]);

  useEffect(() => {
    return () => {
      flyTimersRef.current.forEach((id) => window.clearTimeout(id));
      flyTimersRef.current = [];
      if (cooldownTimerRef.current != null) {
        window.clearTimeout(cooldownTimerRef.current);
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
    setSubmittedQuery(query.trim());
    setNotice(query.trim() ? `正在搜索“${query.trim()}”` : "请输入想查找的 AI 能力");
    window.setTimeout(() => setNotice(""), 1800);
  }

  function openSupportChat() {
    if (window.$chatwoot) {
      window.$chatwoot.toggle("open");
      return;
    }
    setNotice(chatwootReady ? "在线客服暂时不可用，请稍后重试" : "在线客服正在连接，请稍后再试");
  }

  return (
    <div className="portal-home">
      <div className="portal-frame">
        <div className="portal-nav-shell">
          <div className="portal-nav-shell-fill" aria-hidden />
          <header className="portal-nav" aria-label="主导航">
            <PortalLink href="/" className="portal-brand">
              <Image className="portal-brand-mark" src="/brand/reizo-mark.png" alt="" width={32} height={32} priority />
              Reizo
            </PortalLink>
            <nav className="portal-main-links" aria-label="页面导航">
              <PortalLink href="/" className="is-current">首页</PortalLink>
              <PortalLink href="/products?cate=app">应用工具</PortalLink>
              <PortalLink href="/products?cate=api">API模型</PortalLink>
              <PortalLink href="/docs">文档</PortalLink>
              <PortalLink href="/pricing">计费标准</PortalLink>
            </nav>
            <PortalLink href="/pricing" className="portal-membership-entry"><Crown aria-hidden />升级会员</PortalLink>
            <div className="portal-user-links">
              <button type="button" onClick={() => setNotice("暂无新的通知")}><Bell aria-hidden />通知</button>
              {account ? (
                <PortalLink href="/account" className="portal-account"><span>{(account.display_name || account.username).slice(0, 1).toUpperCase()}</span>{account.display_name || account.username}<ChevronRight aria-hidden /></PortalLink>
              ) : (
                <button type="button" className="portal-account" onClick={() => openLogin("login")}><span>E</span>Elliot<ChevronRight aria-hidden /></button>
              )}
            </div>
          </header>
        </div>

        <div className="portal-search-row">
          <section className="portal-search-card" aria-labelledby="portal-search-title">
            <Image className="portal-search-waves" src="/figma-home/search-waves.svg" alt="" fill sizes="710px" priority />
            <div className="portal-search-content">
              <h1 id="portal-search-title">搜索全部 AI 能力</h1>
              <p className="portal-search-description">从应用、模型到 API，快速找到适合当前任务的能力。</p>
              <div className="portal-search-form-row">
                <form className="portal-search-form" onSubmit={submitSearch}>
                  <Search aria-hidden />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索应用、模型或 API" aria-label="搜索 AI 能力" />
                  <button type="submit"><Search aria-hidden />搜索</button>
                </form>
                <PortalLink href="/studio" className="portal-workbench-button"><LayoutGrid aria-hidden />进入工作台<ChevronRight aria-hidden /></PortalLink>
              </div>
              <div className="portal-chip-list" aria-label="热门能力">
                {["产品图生成", "财务分析", "短视频创作", "代码生成", "电商运营", "市场调研", "更多"].map((chip) => (
                  <button key={chip} type="button" className={query === chip ? "is-selected" : ""} onClick={() => { setQuery(chip); setSubmittedQuery(chip); }}>{chip}</button>
                ))}
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
          <aside className="portal-api-card" aria-labelledby="portal-api-title">
            <div className="portal-api-card-head">
              <h2 id="portal-api-title">API模型</h2>
              <ArrowLink href="/products?cate=api">查看全部API模型</ArrowLink>
            </div>
            <div className="portal-api-list" role="list">
              {apiCategories.map((item) => (
                <div key={item.id} className="portal-api-row" role="listitem">
                  <PortalLink href={item.href} className="portal-api-row-label">
                    <AssetIcon src={item.icon} />
                    <span>{item.label}</span>
                  </PortalLink>
                  <span className="portal-api-row-divider" aria-hidden />
                  <div
                    className="portal-api-brands"
                    aria-label={`${item.label}可用模型：${item.brands.map((brand) => brand.label).join("、")}`}
                    title={`悬停查看全部：${item.brands.map((brand) => brand.label).join("、")}`}
                  >
                    {item.brands.map((brand) => (
                      <PortalLink key={brand.label} href={brand.href} className="portal-api-brand">
                        {brand.label}
                      </PortalLink>
                    ))}
                  </div>
                  <PortalLink href={item.href} className="portal-api-row-more" aria-label={`${item.label}更多`}>
                    <ChevronRight aria-hidden />
                  </PortalLink>
                </div>
              ))}
            </div>
          </aside>

          <section className="portal-tools-card" aria-labelledby="portal-tools-title">
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
              {FEATURED_SLIDES.map((slide, index) => (
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
              {FEATURED_SLIDES.map((slide, index) => (
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
            <section className="portal-side-card portal-usage-card" aria-labelledby="portal-usage-title">
              <div className="portal-card-heading"><Image src="/figma-home/usage-icon.svg" alt="" width={20} height={20} /><h2 id="portal-usage-title">账户概览</h2></div>
              <div className="portal-usage-stats">
                <div><span>余额</span><strong>{balance === "余额同步中" ? "¥168.20" : balance}</strong></div>
                <div><span>已消耗 Token</span><strong>1.24M</strong></div>
                <div className="portal-membership-quota"><span><em>Free</em>会员剩余额度</span><strong>80%</strong></div>
              </div>
              <ArrowLink href="/account/usage">用量明细</ArrowLink>
            </section>
          </div>
        </div>

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

      <aside className="portal-floating-tools" aria-label="快捷工具"><button type="button" onClick={openSupportChat}><CircleHelp aria-hidden /><span>客服</span></button><span className="portal-floating-divider" aria-hidden /><button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp aria-hidden /><span>顶部</span></button></aside>
      <div className={`portal-notice ${notice ? "is-visible" : ""}`} role="status" aria-live="polite">{notice}</div>
    </div>
  );
}
