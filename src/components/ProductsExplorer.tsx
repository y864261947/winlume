"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  ChevronRight,
  LayoutGrid,
  PackageSearch,
  Search,
  X,
} from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { RealModelGrid } from "@/components/RealModelGrid";
import { useModals } from "@/components/providers";
import { categoriesByCate, type CateSlug } from "@/data/taxonomy";
import { filterProducts } from "@/data/products";
import { formatBalance } from "@/lib/account";
import type { Audience } from "@/data/audience";
import {
  PLAZA_CAPABILITY_FILTERS,
  type PlazaCapabilityFilter,
  vendorsPresentIn,
} from "@/lib/catalog/plaza-filters";
import type { PlazaModel } from "@/lib/catalog";

interface Props {
  initialCate?: string;
  initialTag?: string;
  initialBrand?: string;
}

type ViewMode = "models" | "apps";

function resolveMode(initialCate?: string): ViewMode {
  if (initialCate === "app") return "apps";
  return "models";
}

export default function ProductsExplorer({
  initialCate,
  initialTag,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { account, balanceConfig, audience, openLogin, selectAudience } = useModals();
  const personalActive = audience !== "business";

  const [mode, setMode] = useState<ViewMode>(() => resolveMode(initialCate));
  const [appTag, setAppTag] = useState<string | undefined>(
    initialCate === "app" ? initialTag : undefined,
  );
  const [query, setQuery] = useState("");
  const [vendorKey, setVendorKey] = useState<string | undefined>();
  const [capability, setCapability] = useState<PlazaCapabilityFilter>("all");
  const [plazaModels, setPlazaModels] = useState<PlazaModel[]>([]);
  const [plazaStats, setPlazaStats] = useState({ total: 0, filtered: 0 });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (mode === "apps") {
      params.set("cate", "app");
      if (appTag) params.set("tag", appTag);
    } else {
      params.set("cate", "api");
    }
    const qs = params.toString();
    router.replace(qs ? `/products?${qs}` : "/products", { scroll: false });
  }, [mode, appTag, router]);

  const onPlazaStats = useCallback(
    (stats: { total: number; filtered: number; models: PlazaModel[] }) => {
      setPlazaStats({ total: stats.total, filtered: stats.filtered });
      setPlazaModels(stats.models);
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

  function changeAudience(next: Audience) {
    selectAudience(next);
    setNotice(next === "personal" ? "已切换到个人版" : "已切换到企业版");
    window.setTimeout(() => setNotice(""), 1800);
  }

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
              Winlume
            </Link>
            <div className="portal-switcher" role="group" aria-label="版本选择">
              <Link
                href="/"
                className={personalActive ? "is-active" : ""}
                onClick={() => changeAudience("personal")}
              >
                个人版
              </Link>
              <Link
                href="/business"
                className={!personalActive ? "is-active" : ""}
                onClick={() => changeAudience("business")}
              >
                企业版
              </Link>
            </div>
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
                模型
              </Link>
              <Link href="/docs">文档</Link>
            </nav>
            <div className="portal-user-links">
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

        {/* Hero — mode is switched via top nav (AI 应用 / API) */}
        <section className="portal-catalog-hero">
          <p className="portal-label">Catalog</p>
          <h1>{mode === "models" ? "模型 API 目录" : "AI 应用目录"}</h1>
          <p className="portal-catalog-lead">
            {mode === "models"
              ? "统一查看已导入定价目录中的模型，价格与 Gateway 计费同源。"
              : "精选应用与工具，按场景挑选可直接打开的工作流。"}
          </p>

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
            <div className="portal-catalog-filters">
              <p className="portal-catalog-filter-label">能力</p>
              <div className="portal-chip-list">
                {PLAZA_CAPABILITY_FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={capability === item.id ? "is-selected" : undefined}
                    onClick={() => setCapability(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {vendorChips.length > 0 ? (
              <div className="portal-catalog-filters">
                <p className="portal-catalog-filter-label">厂商</p>
                <div className="portal-chip-list portal-catalog-vendors">
                  <button
                    type="button"
                    className={!vendorKey ? "is-selected" : undefined}
                    onClick={() => setVendorKey(undefined)}
                  >
                    全部厂商
                  </button>
                  {vendorChips.map((vendor) => (
                    <button
                      key={vendor.key}
                      type="button"
                      className={vendorKey === vendor.key ? "is-selected" : undefined}
                      onClick={() =>
                        setVendorKey(vendor.key === vendorKey ? undefined : vendor.key)
                      }
                    >
                      <img
                        src={vendor.logo}
                        alt=""
                        width={16}
                        height={16}
                        className="portal-catalog-vendor-logo"
                      />
                      {vendor.brandLabel}
                      <span className="portal-catalog-count">{vendor.count}</span>
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
                    : `共 ${plazaStats.total || "—"} 个模型 · 价格含 model / group 倍率`}
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

            <RealModelGrid
              limit={240}
              compact
              query={query}
              vendorKey={vendorKey}
              capability={capability}
              onStats={onPlazaStats}
            />
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
                <p>没有符合条件的应用</p>
                <button
                  type="button"
                  className="portal-arrow-link"
                  onClick={() => {
                    setAppTag(undefined);
                    setQuery("");
                  }}
                >
                  清除筛选
                </button>
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
  );
}
