"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AudioLines,
  BookOpen,
  Braces,
  CircleHelp,
  Contact,
  Database,
  Image,
  Info,
  Languages,
  LaptopMinimal,
  Search,
  Sparkles,
  Tag,
  Video,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { useModals } from "@/components/providers";
import { type Audience } from "@/data/audience";
import { type Product, products } from "@/data/products";

type MarketCategory = {
  id: string;
  label: string;
  productCategories: string[];
  icon: LucideIcon;
};

const marketCategories: MarketCategory[] = [
  { id: "language", label: "语言大模型", productCategories: ["llm"], icon: Languages },
  { id: "image", label: "图片生成", productCategories: ["image-gen", "image-edit"], icon: Image },
  { id: "video", label: "视频生成", productCategories: ["video-gen"], icon: Video },
  { id: "audio", label: "音频 / 语音", productCategories: ["av"], icon: AudioLines },
  { id: "info", label: "信息处理", productCategories: ["info"], icon: Info },
  { id: "rag", label: "RAG 相关", productCategories: ["rag"], icon: Database },
  { id: "tools", label: "工具与 API", productCategories: ["tool-api"], icon: Braces },
];

const logoClasses = [
  "bg-[#0f172a]",
  "bg-[#334155]",
  "bg-[#0e7490]",
  "bg-[#475569]",
  "bg-[#0369a1]",
  "bg-[#1e293b]",
];

function priceLabel(product: Product) {
  if (product.pricing.kind === "token") return `${product.pricing.input} / 1M`;
  if (product.pricing.kind === "unit") return product.pricing.price;
  return product.pricing.label;
}

function matchesSearch(product: Product, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return `${product.name} ${product.brand} ${product.tagline} ${product.features.join(" ")}`
    .toLowerCase()
    .includes(normalized);
}

function productInitial(product: Product) {
  const first = product.name.match(/[a-z0-9]/i)?.[0] ?? product.name.slice(0, 1);
  return first.toUpperCase();
}

export default function ModelMarket() {
  const { audience, industryPrefs, openExperience, openLogin, selectAudience } = useModals();
  const [activeCategory, setActiveCategory] = useState(marketCategories[0].id);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  };

  const category = marketCategories.find((item) => item.id === activeCategory) ?? marketCategories[0];
  const visibleProducts = useMemo(() => {
    const source = query.trim()
      ? products
      : products.filter((product) => category.productCategories.includes(product.category));
    return source.filter((product) => matchesSearch(product, query)).slice(0, 6);
  }, [category.productCategories, query]);
  const featured = visibleProducts[0] ?? products[0];
  const personalActive = audience !== "business";

  const saveAudience = (next: Audience) => {
    selectAudience(next, industryPrefs);
  };

  const chooseAudience = (next: Audience) => {
    saveAudience(next);
    notify(`已切换到${next === "personal" ? "个人版" : "企业版"}`);
  };

  return (
    <div className="model-market min-h-screen overflow-x-hidden bg-canvas text-ink-900">
      <header className="market-top">
        <div className="market-top-inner">
          <nav className="market-nav" aria-label="主导航">
            <Link href="/" className="market-brand" aria-label="WinLume 首页">
              WinLume
            </Link>

            <div className="market-audience" role="group" aria-label="版本选择">
              <Link
                href="/studio"
                aria-current={personalActive ? "page" : undefined}
                className={personalActive ? "is-active" : undefined}
                onClick={() => saveAudience("personal")}
              >
                个人版
              </Link>
              <Link
                href="/business"
                aria-current={!personalActive ? "page" : undefined}
                className={!personalActive ? "is-active" : undefined}
                onClick={() => saveAudience("business")}
              >
                企业版
              </Link>
            </div>

            <form
              className="market-search"
              onSubmit={(event) => {
                event.preventDefault();
                notify(query.trim() ? `已展示“${query.trim()}”的匹配模型` : "请输入模型名称或能力关键词");
              }}
            >
              <Search aria-hidden className="h-4 w-4" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
                placeholder="搜索全部 AI 模型"
                aria-label="搜索全部 AI 模型"
              />
            </form>

            <div className="market-top-links">
              <Link href="/products?cate=app">应用超市</Link>
              <Link href="/products?cate=api">API超市</Link>
              <Link href="/studio">工作台</Link>
              <button type="button" onClick={() => openLogin("login")}>登录 / 注册</button>
              <Link href="/pricing">定价</Link>
              <button type="button" onClick={() => notify("帮助中心正在准备中")}>支持</button>
            </div>
          </nav>

          <div className="market-banner-row">
            <section className="market-promo" aria-labelledby="market-promo-title">
              <div className="relative z-10">
                <h1 id="market-promo-title">企业认证：模型使用权益升级</h1>
                <p>个人与企业都能使用的 AI 模型市场</p>
                <button type="button" onClick={() => chooseAudience("business")}>了解更多</button>
              </div>
              <div className="market-ai-stack" aria-hidden="true">
                <div className="market-ai-base" />
                <div className="market-ai-card market-ai-card-back">AI</div>
                <div className="market-ai-card market-ai-card-front">AI</div>
              </div>
            </section>
            <section className="market-welcome" aria-label="欢迎信息">
              <strong>Hi~</strong>
              <p>面向个人与企业的模型资源与 Artifact 工作台。</p>
            </section>
          </div>
        </div>
      </header>

      <main className="market-body">
        <div className="market-shell">
          <aside className="market-sidebar" aria-label="模型分类">
            {marketCategories.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === activeCategory;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={isActive ? "is-active" : undefined}
                  aria-pressed={isActive}
                  onClick={() => {
                    setActiveCategory(item.id);
                    setQuery("");
                    notify(`已切换到${item.label}`);
                  }}
                >
                  <Icon aria-hidden className="h-5 w-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </aside>

          <section className="min-w-0" aria-label="模型市场内容">
            <article className="market-featured">
              <div className="market-featured-main">
                <div className="market-featured-icon"><Sparkles aria-hidden className="h-8 w-8" /></div>
                <div className="min-w-0">
                  <h2>{featured.name}</h2>
                  <p>{featured.tagline}</p>
                </div>
                <div className="market-featured-price">
                  <strong>{priceLabel(featured)}</strong>
                  <button type="button" onClick={() => openExperience(featured)}>立即体验</button>
                </div>
              </div>
              <div className="market-tags">
                <span>{featured.type}</span>
                <span>{featured.brand}</span>
                {featured.features.slice(0, 1).map((feature) => <span key={feature}>{feature}</span>)}
              </div>
              <div className="market-dots" aria-label="精选模型轮播位置">
                <span className="is-active" />
                <span />
                <span />
                <span />
              </div>
            </article>

            <div className="market-section-heading">
              <h2>{query.trim() ? "搜索结果" : "精选列表"}</h2>
              <span>{visibleProducts.length} 个模型</span>
            </div>

            {visibleProducts.length ? (
              <div className="market-grid">
                {visibleProducts.map((product, index) => (
                  <article key={product.id} className="market-model-card">
                    <div className="market-model-head">
                      <span className={`market-model-logo ${logoClasses[index % logoClasses.length]}`}>{productInitial(product)}</span>
                      <div className="min-w-0">
                        <h3>{product.name}</h3>
                        <p>{product.brand}</p>
                      </div>
                    </div>
                    <p className="market-model-copy">{product.tagline}</p>
                    <div className="market-tags">
                      <span>{product.type}</span>
                      {product.features.slice(0, 2).map((feature) => <span key={feature}>{feature}</span>)}
                    </div>
                    <div className="market-model-footer">
                      <div className="flex items-center gap-3 text-ink-500">
                        <Link href={`/products/${product.id}`} aria-label={`查看 ${product.name} 详情`} title="查看详情"><BookOpen className="h-4 w-4" /></Link>
                        <button type="button" aria-label={`使用 ${product.name}`} title="立即体验" onClick={() => openExperience(product)}><WandSparkles className="h-4 w-4" /></button>
                      </div>
                      <span>{priceLabel(product)}</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="market-empty">
                <Search aria-hidden className="h-7 w-7" />
                <p>没有找到匹配的模型</p>
                <button type="button" onClick={() => setQuery("")}>清除搜索</button>
              </div>
            )}
          </section>
        </div>
      </main>

      <aside className="market-rail" aria-label="快捷工具">
        <button type="button" onClick={() => notify("联系支持：support@winlume.example")}><Contact aria-hidden /><span>联系</span></button>
        <Link href="/pricing"><Tag aria-hidden /><span>定价</span></Link>
        <button type="button" onClick={() => notify("Token 计算器正在准备中")}><Database aria-hidden /><span>Token</span></button>
        <button type="button" onClick={() => notify("客户端即将上线")}><LaptopMinimal aria-hidden /><span>客户端</span></button>
        <button type="button" onClick={() => notify("帮助中心正在准备中")}><CircleHelp aria-hidden /><span>帮助</span></button>
      </aside>

      <div className={`market-toast ${toast ? "is-visible" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
