"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, ChevronRight, CircleHelp, LayoutGrid, Search, ArrowUp } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useModals } from "@/components/providers";
import { type Audience } from "@/data/audience";
import { formatBalance } from "@/lib/account";
import type { CapabilityCatalog, CapabilityId } from "@/lib/studio/capabilities";
import { WORK_SCENES, type WorkSceneId } from "@/lib/studio/work-scenes";

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

type ApiCategory = {
  id: string;
  label: string;
  icon: string;
  capability?: CapabilityId;
  presetId?: string;
  launchLabel?: string;
};

type ApiMenuOption = {
  id: string;
  label: string;
  href: string;
};

const apiCategories: readonly ApiCategory[] = [
  {
    id: "chat",
    label: "语言模型",
    icon: "/figma-home/icon-chat.svg",
    capability: "chat",
    presetId: "chat-default",
  },
  {
    id: "image",
    label: "图片生成",
    icon: "/figma-home/icon-image.svg",
    capability: "image.generate",
    presetId: "image-default",
    launchLabel: "打开图像创作",
  },
  {
    id: "video",
    label: "视频生成",
    icon: "/figma-home/icon-video.svg",
    capability: "video.generate",
    presetId: "video-default",
    launchLabel: "打开视频创作",
  },
  {
    id: "canvas",
    label: "画布与图解",
    icon: "/figma-home/icon-db.svg",
    capability: "canvas.generate",
    presetId: "canvas-default",
    launchLabel: "打开画布创作",
  },
  { id: "voice", label: "语音处理", icon: "/figma-home/icon-voice.svg" },
  { id: "data", label: "数据与搜索", icon: "/figma-home/icon-search.svg" },
];

const popularModels = [
  { name: "GPT-4o", detail: "多模态对话", mark: "GPT", tone: "blue" },
  { name: "Kimi K2", detail: "长上下文", mark: "K", tone: "violet" },
  { name: "DeepSeek V3", detail: "深度推理", mark: "DS", tone: "teal" },
  { name: "Flux Pro", detail: "图像生成", mark: "F", tone: "orange" },
] as const;

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

const productPaths = [
  {
    id: "api",
    index: "01",
    title: "一个 API Key，连接全部模型",
    outcome: "对话、图像、视频与语音统一接入，OpenAI 兼容调用。",
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
    cta: "打开视频台",
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
    outcome: "连接模型、工具与人工审核，按模板启动。",
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
    title: "让 AI 进入企业工作流程",
    outcome: "知识库、客服销售与私有化部署，可管可控。",
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
      { label: "© 2026 Winlume", href: "/" },
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

export function getApiMenuOptions(
  item: ApiCategory,
  catalog: CapabilityCatalog | null,
): ApiMenuOption[] {
  const capability = item.capability
    ? catalog?.capabilities.find((entry) => entry.id === item.capability)
    : null;
  if (!catalog || !capability || capability.availability !== "available") {
    return [];
  }

  if (item.capability === "chat") {
    return catalog.models.map((model) => ({
      id: model,
      label: model,
      href: `/studio?preset=chat-default&model=${encodeURIComponent(model)}`,
    }));
  }

  if (!item.presetId || !item.launchLabel) return [];
  return [
    {
      id: item.presetId,
      label: item.launchLabel,
      href: `/studio?preset=${encodeURIComponent(item.presetId)}`,
    },
  ];
}

function getApiStatus(
  item: ApiCategory,
  catalog: CapabilityCatalog | null,
  catalogState: "loading" | "ready" | "failed",
): string {
  if (catalogState === "loading") return "正在检查";
  if (!item.capability) return "暂未接入";
  if (catalogState === "failed") return "暂不可用";
  return catalog?.capabilities.find((entry) => entry.id === item.capability)?.reason ?? "暂不可用";
}

export default function ModelMarket() {
  const { account, balanceConfig, audience, openLogin, selectAudience } = useModals();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
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
  const [capabilityCatalog, setCapabilityCatalog] = useState<CapabilityCatalog | null>(null);
  const [capabilityCatalogState, setCapabilityCatalogState] = useState<
    "loading" | "ready" | "failed"
  >("loading");
  const [openApi, setOpenApi] = useState<string | null>(null);
  const personalActive = audience !== "business";
  const balance = formatBalance(account?.quota, balanceConfig);
  const activePath = productPaths.find((path) => path.id === activePathId) ?? productPaths[0];
  const stackPaths = stackOrderFrom(activePath.id).slice(0, STACK_VISIBLE);

  useEffect(() => {
    activePathIdRef.current = activePathId;
  }, [activePathId]);

  useEffect(() => {
    return () => {
      flyTimersRef.current.forEach((id) => window.clearTimeout(id));
      flyTimersRef.current = [];
      if (cooldownTimerRef.current != null) {
        window.clearTimeout(cooldownTimerRef.current);
      }
    };
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

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/capabilities", { credentials: "same-origin" })
      .then(async (response) => {
        if (!response.ok) throw new Error("capabilities");
        return response.json() as Promise<CapabilityCatalog>;
      })
      .then((catalog) => {
        if (cancelled) return;
        setCapabilityCatalog(catalog);
        setCapabilityCatalogState("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setCapabilityCatalog(null);
        setCapabilityCatalogState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function changeAudience(next: Audience) {
    selectAudience(next);
    setNotice(next === "personal" ? "已切换到个人版" : "已切换到企业版");
    window.setTimeout(() => setNotice(""), 1800);
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(query.trim());
    setNotice(query.trim() ? `正在搜索“${query.trim()}”` : "请输入想查找的 AI 能力");
    window.setTimeout(() => setNotice(""), 1800);
  }

  return (
    <div className="portal-home">
      <div className="portal-frame">
        <div className="portal-nav-shell">
          <div className="portal-nav-shell-fill" aria-hidden />
          <header className="portal-nav" aria-label="主导航">
            <PortalLink href="/" className="portal-brand">Winlume</PortalLink>
            <div className="portal-switcher" role="group" aria-label="版本选择">
              <PortalLink href="/" className={personalActive ? "is-active" : ""} onClick={() => changeAudience("personal")}>个人版</PortalLink>
              <PortalLink href="/business" className={!personalActive ? "is-active" : ""} onClick={() => changeAudience("business")}>企业版</PortalLink>
            </div>
            <nav className="portal-main-links" aria-label="页面导航">
              <PortalLink href="/" className="is-current">首页</PortalLink>
              <PortalLink href="/products?cate=app">AI 应用</PortalLink>
              <PortalLink href="/studio">智能体</PortalLink>
              <PortalLink href="/products?cate=api">API</PortalLink>
              <PortalLink href="/business">企业服务</PortalLink>
            </nav>
            <div className="portal-user-links">
              <PortalLink href="/studio"><LayoutGrid aria-hidden />工作台</PortalLink>
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
              <SectionLabel>WINLUME AI HUB</SectionLabel>
              <h1 id="portal-search-title">搜索全部 AI 能力</h1>
              <form className="portal-search-form" onSubmit={submitSearch}>
                <Search aria-hidden />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 AI 应用、智能体、模型 API、图片、视频与行业工具..." aria-label="搜索 AI 能力" />
                <button type="submit"><Search aria-hidden />搜索</button>
              </form>
              <div className="portal-chip-list" aria-label="热门能力">
                {["AI 写作", "图片生成", "视频创作", "文件分析", "编程"].map((chip) => (
                  <button key={chip} type="button" className={query === chip ? "is-selected" : ""} onClick={() => { setQuery(chip); setSubmittedQuery(chip); }}>{chip}</button>
                ))}
              </div>
            </div>
            <ArrowLink href="/products">查看热门搜索</ArrowLink>
          </section>

          <section className="portal-usage-card" aria-labelledby="portal-usage-title">
            <div className="portal-card-heading"><Image src="/figma-home/usage-icon.svg" alt="" width={20} height={20} /><h2 id="portal-usage-title">账户用量</h2></div>
            <div className="portal-usage-stats">
              <div><span>余额</span><strong>{balance === "余额同步中" ? "¥168.20" : balance}</strong></div>
              <div><span>Token</span><strong>1.24M</strong></div>
            </div>
            <ArrowLink href="/account/usage">用量明细</ArrowLink>
          </section>
        </div>

        {submittedQuery && <p className="portal-search-result" role="status">已为你准备“{submittedQuery}”相关能力，先从下面的工具分类开始。</p>}

        <div className="portal-discovery-grid">
          <aside className="portal-api-card" aria-labelledby="portal-api-title">
            <h2 id="portal-api-title">API 类别</h2>
            <div className="portal-api-list">
              {apiCategories.map((item) => {
                const options = getApiMenuOptions(item, capabilityCatalog);
                const isOpen = openApi === item.id && options.length > 0;
                const status = getApiStatus(item, capabilityCatalog, capabilityCatalogState);
                return (
                  <div
                    key={item.id}
                    className="portal-api-item"
                    data-open={isOpen}
                    onPointerEnter={(event) => {
                      if (event.pointerType !== "touch" && options.length) {
                        setOpenApi(item.id);
                      }
                    }}
                    onPointerLeave={() => setOpenApi((current) => current === item.id ? null : current)}
                    onFocusCapture={() => {
                      if (options.length) setOpenApi(item.id);
                    }}
                    onBlurCapture={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        setOpenApi((current) => current === item.id ? null : current);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") return;
                      event.preventDefault();
                      setOpenApi(null);
                      event.currentTarget.querySelector<HTMLButtonElement>("button")?.focus();
                    }}
                  >
                    {options.length ? (
                      <button
                        type="button"
                        className="portal-api-trigger"
                        aria-expanded={isOpen}
                        aria-controls={`${item.id}-models`}
                        aria-haspopup="menu"
                        onClick={() => setOpenApi((current) => current === item.id ? null : item.id)}
                      >
                        <AssetIcon src={item.icon} />
                        <span>{item.label}</span>
                        <ChevronRight aria-hidden />
                      </button>
                    ) : (
                      <div className="portal-api-unavailable" aria-disabled="true">
                        <AssetIcon src={item.icon} />
                        <span>{item.label}</span>
                        <small>{status}</small>
                      </div>
                    )}
                    {options.length ? (
                      <div
                        id={`${item.id}-models`}
                        className="portal-api-menu"
                        role="menu"
                        aria-label={`${item.label}可用选项`}
                        hidden={!isOpen}
                      >
                        {options.map((option) => (
                          <Link key={option.id} href={option.href} role="menuitem">
                            {option.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="portal-popular-models" aria-labelledby="popular-models-title">
              <div className="portal-popular-models-heading">
                <h3 id="popular-models-title">常用模型</h3>
                <Link href="/products?cate=api">全部</Link>
              </div>
              <div className="portal-model-shortcuts">
                {popularModels.map((model) => (
                  <Link
                    key={model.name}
                    href={`/studio?preset=chat-default&model=${encodeURIComponent(model.name)}`}
                    className="portal-model-shortcut"
                    aria-label={`使用 ${model.name}，${model.detail}`}
                  >
                    <span className={`portal-model-mark ${model.tone}`} aria-hidden>{model.mark}</span>
                    <span><strong>{model.name}</strong><small>{model.detail}</small></span>
                  </Link>
                ))}
              </div>
            </div>
            <ArrowLink href="/studio">进入工作台</ArrowLink>
          </aside>

          <article className="portal-featured-card">
            <Image className="portal-featured-art" src="/figma-home/featured.svg" alt="" fill sizes="812px" priority loading="eager" />
            <div className="portal-featured-copy">
              <h2>今日精选</h2><p>AI 行业前沿动态</p><SectionLabel>模型动态</SectionLabel>
              <h3>Kimi 新模型发布</h3><p>长文本、多模态与 Agent 能力迎来新升级</p>
              <PortalLink href="/products?cate=api" className="portal-primary-button">查看详情</PortalLink>
            </div>
            <div className="portal-featured-news">
              <PortalLink href="/products?cate=app">视频生成进入实时编辑阶段</PortalLink>
              <PortalLink href="/products?cate=api">企业 Agent 加速进入业务系统</PortalLink>
              <PortalLink href="/products?cate=app">多模态搜索的下一轮竞争</PortalLink>
            </div>
            <div className="portal-featured-footer"><ArrowLink href="/products">查看全部行业动态</ArrowLink><span>‹ 01 / 04 ›</span></div>
          </article>

          <div className="portal-side-cards">
            <article className="portal-side-card portal-enterprise-card"><SectionLabel>ENTERPRISE</SectionLabel><h2>企业 AI 部署</h2><p>私有化部署、系统集成与专属服务。</p><ArrowLink href="/business">查看方案</ArrowLink><Image src="/figma-home/building.svg" alt="" width={145} height={116} /></article>
            <article className="portal-side-card portal-pricing-card"><h2>计费标准</h2><p>按实际使用量灵活结算，清晰可见。</p><ArrowLink href="/pricing">查看价格</ArrowLink><Image src="/figma-home/price.svg" alt="" width={118} height={108} /></article>
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
              <div className="portal-ed-stage-head-row">
                <h2 id="portal-paths-title">选一条路径，先看见产品，再决定进入</h2>
                <p className="portal-ed-lede">
                  模型接入、创作工作台、团队治理与企业部署，每条路径对应一个可直接开始的结果。
                </p>
              </div>
              <dl className="portal-ed-metrics" aria-label="平台要点">
                <div>
                  <dt>统一接口</dt>
                  <dd>OpenAI 兼容</dd>
                </div>
                <div>
                  <dt>创作面</dt>
                  <dd>图 · 视频 · 对话</dd>
                </div>
                <div>
                  <dt>治理</dt>
                  <dd>Key · 预算 · 审计</dd>
                </div>
                <div>
                  <dt>企业</dt>
                  <dd>私有化可选</dd>
                </div>
              </dl>
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
                <button type="button" className="portal-ed-support-cta" onClick={() => openLogin("login")}>
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

          <section className="portal-ed-close" aria-labelledby="portal-close-title">
            <div className="portal-ed-close-glow" aria-hidden />
            <div className="portal-ed-close-copy">
              <p className="portal-ed-kicker portal-ed-kicker-light">Start now</p>
              <h2 id="portal-close-title">先跑通一次，再决定怎么规模化</h2>
              <p>从工作台开始体验，或直接接入模型 API。企业需求可走方案评估。</p>
            </div>
            <div className="portal-ed-close-actions">
              <PortalLink href="/studio" className="portal-ed-btn-primary">
                进入工作台
              </PortalLink>
              <PortalLink href="/products?cate=api" className="portal-ed-btn-secondary">
                浏览模型 API
              </PortalLink>
              <PortalLink href="/business" className="portal-ed-btn-ghost">
                企业方案
                <ChevronRight aria-hidden />
              </PortalLink>
            </div>
          </section>

          <footer className="portal-ed-footer">
            <div className="portal-ed-footer-brand">
              <strong>Winlume</strong>
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

      <aside className="portal-floating-tools" aria-label="快捷工具"><button type="button" onClick={() => openLogin("login")}><CircleHelp aria-hidden /><span>客服</span></button><span className="portal-floating-divider" aria-hidden /><button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp aria-hidden /><span>顶部</span></button></aside>
      <div className={`portal-notice ${notice ? "is-visible" : ""}`} role="status" aria-live="polite">{notice}</div>
    </div>
  );
}
