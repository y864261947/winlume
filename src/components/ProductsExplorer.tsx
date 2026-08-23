"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  Bell,
  BookOpen,
  ChevronRight,
  Database,
  FileSearch,
  LayoutGrid,
  MessageSquareText,
  PackageSearch,
  Search,
  SlidersHorizontal,
  Volume2,
  Video,
  X,
} from "lucide-react";
import ProductCard from "@/components/ProductCard";
import ApplicationDirectory from "@/components/ApplicationDirectory";
import { RealModelGrid } from "@/components/RealModelGrid";
import { useModals } from "@/components/providers";
import { categoriesByCate, type CateSlug } from "@/data/taxonomy";
import { filterProducts } from "@/data/products";
import { formatBalance } from "@/lib/account";
import {
  type PlazaCapabilityFilter,
  vendorsPresentIn,
} from "@/lib/catalog/plaza-filters";
import type { PlazaModel } from "@/lib/catalog";
import { modelDescription, modelPriceLines, modelTags, resolvePlazaVendor } from "@/lib/catalog/plaza-display";

interface Props {
  initialCate?: string;
  initialTag?: string;
  initialBrand?: string;
  initialQuery?: string;
}

type ViewMode = "models" | "apps";

const MODEL_CATEGORIES = [
  { id: "llm", label: "语言推理", providers: "OpenAI · Anthropic · Gemini", icon: MessageSquareText },
  { id: "image", label: "图像处理", providers: "DALL·E · FLUX · Stability AI", icon: FileSearch },
  { id: "video", label: "视频处理", providers: "Sora · Kling · Runway · Pika", icon: Video },
  { id: "audio", label: "音频处理", providers: "Whisper · ElevenLabs · MiniMax", icon: Volume2 },
  { id: "embed", label: "RAG 知识库", providers: "Embedding · Rerank · Vector", icon: Database },
  { id: "other", label: "信息检索", providers: "Jina AI · Cohere · Google", icon: Search },
] as const;

function resolveMode(initialCate?: string): ViewMode {
  if (initialCate === "app") return "apps";
  return "models";
}

export default function ProductsExplorer({
  initialCate,
  initialTag,
  initialBrand,
  initialQuery,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { account, balanceConfig, openLogin, openMembership } = useModals();

  const mode = resolveMode(initialCate);
  const [appTag, setAppTag] = useState<string | undefined>(
    initialCate === "app" ? initialTag : undefined,
  );
  const [query, setQuery] = useState(initialQuery ?? "");
  const [vendorKey, setVendorKey] = useState<string | undefined>(initialBrand);
  const [capability, setCapability] = useState<PlazaCapabilityFilter>("all");
  const [plazaModels, setPlazaModels] = useState<PlazaModel[]>([]);
  const [plazaStats, setPlazaStats] = useState({ total: 0, filtered: 0 });
  const [notice, setNotice] = useState("");
  const [selectedModel, setSelectedModel] = useState<PlazaModel | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (mode === "apps") {
      params.set("cate", "app");
      if (appTag) params.set("tag", appTag);
    } else {
      params.set("cate", "api");
    }
    if (query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    router.replace(qs ? `/products?${qs}` : "/products", { scroll: false });
  }, [mode, appTag, query, router]);

  const onPlazaStats = useCallback(
    (stats: { total: number; filtered: number; models: PlazaModel[] }) => {
      setPlazaStats({ total: stats.total, filtered: stats.filtered });
      setPlazaModels(stats.models);
      setSelectedModel((current) => current ?? stats.models[0] ?? null);
    },
    [],
  );

  const vendorChips = useMemo(() => vendorsPresentIn(plazaModels), [plazaModels]);
  const appCategories = useMemo(() => categoriesByCate("app" as CateSlug), []);
  const appList = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return filterProducts({ cate: "app", tag: appTag }).filter((product) => {
      if (!normalized) return true;
      return `${product.name} ${product.brand} ${product.tagline}`.toLowerCase().includes(normalized);
    });
  }, [appTag, query]);

  const resetModelFilters = () => {
    setQuery("");
    setVendorKey(undefined);
    setCapability("all");
  };

  const hasModelFilters = Boolean(query || vendorKey || capability !== "all");

  const navCurrent = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href.startsWith("/products")) return pathname.startsWith("/products");
    return pathname.startsWith(href);
  };

  return (
    <div className="portal-home">
      <div className="portal-frame pb-16">
        {/* Same portal nav as homepage */}
        <div className="portal-nav-shell">
          <div className="portal-nav-shell-fill" aria-hidden />
          <header className="portal-nav" aria-label="主导航">
            <Link href="/" className="portal-brand">
              <Image className="portal-brand-mark" src="/brand/reizo-mark.png" alt="" width={32} height={32} priority />
              Reizo
            </Link>
            <nav className="portal-main-links" aria-label="页面导航">
              <Link href="/" className={navCurrent("/") ? "is-current" : undefined}>
                首页
              </Link>
              <Link
                href="/products?cate=app"
                className={mode === "apps" ? "is-current" : undefined}
              >
                应用工具
              </Link>
              <Link
                href="/products?cate=api"
                className={mode === "models" ? "is-current" : undefined}
              >
                API模型
              </Link>
              <Link href="/docs">文档</Link>
              <Link href="/pricing">计费标准</Link>
            </nav>
            <div className="portal-user-links">
              <button type="button" className="portal-membership-entry" onClick={openMembership}>升级会员</button>
              <Link href="/studio">
                <LayoutGrid aria-hidden />
                Agent
              </Link>
              <button type="button" onClick={() => setNotice("暂无新的通知")}>
                <Bell aria-hidden />
                通知
              </button>
              {account ? (
                <Link href="/account" className="portal-account">
                  <span>{(account.display_name || account.username).slice(0, 1).toUpperCase()}</span>
                  {account.display_name || account.username}
                  <ChevronRight aria-hidden />
                </Link>
              ) : (
                <button
                  type="button"
                  className="portal-account"
                  onClick={() => openLogin("login")}
                >
                  <span>登</span>
                  登录
                  <ChevronRight aria-hidden />
                </button>
              )}
            </div>
          </header>
        </div>

        {notice ? (
          <p className="mt-3 rounded-[8px] border border-[rgba(13,79,201,.2)] bg-[rgba(13,79,201,.06)] px-3 py-2 text-sm text-[var(--portal-blue)]">
            {notice}
            {account && balanceConfig ? ` · 余额 ${formatBalance(account.quota, balanceConfig)}` : ""}
          </p>
        ) : null}

        {mode === "apps" ? (
          <ApplicationDirectory initialQuery={initialQuery} />
        ) : (
        <div className="portal-directory-layout">
          <aside className="portal-directory-side">
            <h2>{mode === "models" ? "API模型" : "工具分类"}</h2>
            <button type="button" className={`portal-directory-all ${!appTag && capability === "all" ? "is-active" : ""}`} onClick={() => mode === "models" ? resetModelFilters() : setAppTag(undefined)}>
              {mode === "models" ? "全部模型" : "全部应用"}<ChevronRight aria-hidden />
            </button>
            {mode === "models" ? (
              MODEL_CATEGORIES.map(({ id, label, providers, icon: Icon }) => (
                <button key={id} type="button" className="portal-directory-model-row" data-active={capability === id || undefined} onClick={() => setCapability(id as PlazaCapabilityFilter)}>
                  <Icon aria-hidden />
                  <span><strong>{label}</strong><small>{providers}</small></span><ChevronRight aria-hidden />
                </button>
              ))
            ) : appCategories.map((category) => (
              <button key={category.slug} type="button" className={appTag === category.slug ? "is-active" : undefined} onClick={() => setAppTag(category.slug)}>{category.name}<ChevronRight aria-hidden /></button>
            ))}
          </aside>
          <div className="portal-directory-main">
        {/* Hero — mode is switched via top nav (AI 应用 / API) */}
        <section className="portal-catalog-hero">
          <div className="portal-catalog-title-row">
            <div>
              <h1>{mode === "models" ? "全部 API 模型" : "AI 应用目录"}</h1>
              <p className="portal-catalog-lead">
                {mode === "models"
                  ? "汇集全球优质 AI 模型，通过 API 快速集成到你的应用中。"
                  : "精选应用与工具，按场景挑选；进入工作台后仍可修改提示词与模型。"}
              </p>
            </div>
            {mode === "models" ? <div className="portal-catalog-hero-links"><Link href="/docs/api"><BookOpen aria-hidden /> API 文档</Link><Link href="/pricing">计费说明</Link></div> : null}
          </div>
          <form
            className="portal-catalog-search"
            onSubmit={(event) => event.preventDefault()}
          >
            <Search aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label={mode === "models" ? "搜索模型" : "搜索应用"}
              placeholder={
                mode === "models"
                  ? "搜索模型名称、厂商，例如 gpt-5.5、claude、deepseek…"
                  : "搜索应用名称、品牌或场景…"
              }
            />
            {query ? (
              <button
                type="button"
                className="portal-catalog-clear"
                onClick={() => setQuery("")}
                aria-label="清除搜索"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            <button type="submit">
              <Search aria-hidden />
              搜索
            </button>
          </form>
          {mode === "models" && plazaStats.total > 0 ? (
            <p className="portal-catalog-search-hint">
              {hasModelFilters
                ? `匹配 ${plazaStats.filtered} / ${plazaStats.total} 个模型`
                : `共 ${plazaStats.total} 个模型可检索`}
            </p>
          ) : null}
        </section>

        {mode === "models" ? (
          <>
            <div className="portal-model-controls" aria-label="模型筛选">
              <button type="button" onClick={() => setVendorKey(undefined)}>厂商 <ChevronRight aria-hidden /></button>
              <button type="button" onClick={() => setCapability("all")}>能力 <ChevronRight aria-hidden /></button>
              <button type="button" onClick={resetModelFilters}>价格 <ChevronRight aria-hidden /></button>
              <button type="button" onClick={() => setCapability("llm")}>上下文 <ChevronRight aria-hidden /></button>
              <button type="button" className="portal-model-control-sort">排序：综合推荐 <ChevronRight aria-hidden /></button>
              <button type="button" className="portal-model-control-sliders" aria-label="更多筛选"><SlidersHorizontal aria-hidden /></button>
            </div>

            {vendorChips.length > 0 ? (
              <div className="portal-model-vendor-strip">
                <div className="portal-model-strip-title"><span>🔥</span><strong>热门推荐</strong></div>
                <div className="portal-model-vendor-scroller">
                  {vendorChips.slice(0, 7).map((vendor) => (
                    <button key={vendor.key} type="button" className={vendorKey === vendor.key ? "is-selected" : undefined} onClick={() => setVendorKey(vendor.key === vendorKey ? undefined : vendor.key)}>
                      <img src={vendor.logo} alt="" width={26} height={26} />
                      <span>{vendor.brandLabel}</span><small>{vendor.count} 个模型</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="portal-catalog-section-head">
              <div>
                <h2>全部模型</h2>
                <p>
                  {hasModelFilters
                  ? `已筛选 ${plazaStats.filtered} / ${plazaStats.total} 个模型`
                    : `共 ${plazaStats.total || "—"} 个模型`}
                </p>
              </div>
              {hasModelFilters ? (
                <button type="button" className="portal-arrow-link" onClick={resetModelFilters}>
                  清除筛选
                </button>
              ) : (
                <span className="portal-catalog-meta">PRICING CATALOG</span>
              )}
            </div>

            <div className={`portal-model-directory${selectedModel ? " has-detail" : ""}`}>
            <RealModelGrid
              limit={240}
              compact
              query={query}
              vendorKey={vendorKey}
              capability={capability}
              onStats={onPlazaStats}
              onClearFilters={resetModelFilters}
              selectedModelName={selectedModel?.model_name}
              onSelectModel={setSelectedModel}
              variant="directory"
            />
            {selectedModel ? (() => {
              const vendor = resolvePlazaVendor(selectedModel, { name: selectedModel.vendor_name, logo: selectedModel.vendor_logo });
              const price = modelPriceLines(selectedModel);
              return <aside className="portal-model-detail">
                <button type="button" className="portal-model-detail-close" onClick={() => setSelectedModel(null)}><X aria-hidden /></button>
                <div className="portal-model-detail-brand"><img src={vendor.logo} alt="" /><div><h2>{selectedModel.model_name}</h2><span>{vendor.brandLabel}</span></div></div>
                <p>{modelDescription(selectedModel, vendor)}</p>
                <div className="portal-model-detail-tags">{modelTags(selectedModel).map((tag) => <span key={tag.label}>{tag.label}</span>)}</div>
                <dl><div><dt>计费方式</dt><dd>{price.kind === "fixed" || price.kind === "tiered" ? price.text : `${price.input} / ${price.output}`}</dd></div><div><dt>调用协议</dt><dd>HTTPS / JSON</dd></div><div><dt>端点能力</dt><dd>{selectedModel.supported_endpoint_types?.join("、") || "标准模型调用"}</dd></div></dl>
                <h3>适合场景</h3><ul><li>复杂推理与问题解答</li><li>内容生成与信息处理</li><li>Agent 与自动化任务</li></ul>
                <div className="portal-model-detail-actions"><Link href="/docs/api">查看 API 文档</Link><Link href={`/studio?model=${encodeURIComponent(selectedModel.model_name)}`}>立即调用 API</Link></div>
              </aside>;
            })() : null}
            </div>
          </>
        ) : (
          <>
            <div className="portal-catalog-filters">
              <p className="portal-catalog-filter-label">应用类目</p>
              <div className="portal-chip-list">
                <button
                  type="button"
                  className={!appTag ? "is-selected" : undefined}
                  onClick={() => setAppTag(undefined)}
                >
                  全部
                </button>
                {appCategories.map((category) => (
                  <button
                    key={category.slug}
                    type="button"
                    className={appTag === category.slug ? "is-selected" : undefined}
                    onClick={() =>
                      setAppTag(category.slug === appTag ? undefined : category.slug)
                    }
                  >
                    <span
                      className="portal-catalog-dot"
                      style={{ backgroundColor: category.color }}
                      aria-hidden
                    />
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="portal-catalog-section-head">
              <div>
                <h2>应用目录</h2>
                <p>
                  共 <strong>{appList.length}</strong> 个应用
                  {appTag || query ? "（已筛选）" : ""}
                </p>
              </div>
            </div>

            {appList.length === 0 ? (
              <div className="portal-catalog-empty">
                <PackageSearch className="h-10 w-10 text-[#9aa8b5]" />
                <h3>没有符合条件的应用</h3>
                <p>尝试清除搜索或应用类目，重新浏览全部应用。</p>
                <div className="portal-catalog-empty-actions">
                  <button
                    type="button"
                    className="portal-catalog-empty-secondary"
                    onClick={() => {
                      setAppTag(undefined);
                      setQuery("");
                    }}
                  >
                    清除筛选
                  </button>
                  <Link
                    href="/studio?entry=application-catalog-empty"
                    className="portal-catalog-empty-primary"
                  >
                    进入工作台 <ArrowRight aria-hidden />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {appList.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </>
        )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
