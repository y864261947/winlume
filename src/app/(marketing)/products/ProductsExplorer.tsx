"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, PackageSearch, Search, X } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import { categories, categoriesByCate, CateSlug } from "@/data/taxonomy";
import { filterProducts, products } from "@/data/products";
import { useModals } from "@/components/providers";
import PublicModelPlaza from "@/components/PublicModelPlaza";
import { RealModelGrid } from "@/components/RealModelGrid";

interface Props {
  initialCate?: string;
  initialTag?: string;
  initialBrand?: string;
}

const cateOptions: { slug?: CateSlug; name: string }[] = [
  { slug: undefined, name: "全部" },
  { slug: "api", name: "API" },
  { slug: "app", name: "应用" },
];

const chipBase =
  "flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-1.5 text-sm ring-1 transition cursor-pointer";
const chipIdle = "text-ink-600 ring-line hover:text-ink-900 hover:ring-line-strong";
const chipActive = "bg-primary-50 font-medium text-primary-600 ring-primary-200";

export default function ProductsExplorer({
  initialCate,
  initialTag,
  initialBrand,
}: Props) {
  const router = useRouter();
  const [cate, setCate] = useState<string | undefined>(initialCate);
  const [tag, setTag] = useState<string | undefined>(initialTag);
  const [brand, setBrand] = useState<string | undefined>(initialBrand);
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { favorites } = useModals();

  // 保持 URL 与筛选状态同步（可分享、可后退）
  useEffect(() => {
    const params = new URLSearchParams();
    if (cate) params.set("cate", cate);
    if (tag) params.set("tag", tag);
    if (brand) params.set("brand", brand);
    const qs = params.toString();
    router.replace(qs ? `/products?${qs}` : "/products", { scroll: false });
  }, [cate, tag, brand, router]);

  const visibleCats = useMemo(() => {
    if (cate === "api" || cate === "app") return categoriesByCate(cate);
    return categories;
  }, [cate]);

  const visibleBrands = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (cate === "api" && p.type === "应用") return;
      if (cate === "app" && p.type !== "应用") return;
      if (tag && p.category !== tag) return;
      set.add(p.brand);
    });
    return [...set];
  }, [cate, tag]);

  const list = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return filterProducts({ cate, tag, brand }).filter((product) => {
      if (favoritesOnly && !favorites.includes(product.id)) return false;
      if (!normalized) return true;
      return `${product.name} ${product.brand} ${product.tagline}`.toLowerCase().includes(normalized);
    });
  }, [brand, cate, favorites, favoritesOnly, query, tag]);

  const hasFilter = Boolean(cate || tag || brand || query || favoritesOnly);
  // 无筛选且不在"应用"tab 时展示实时模型广场；一旦有任何筛选条件，展示过滤后的静态目录
  const showLivePlaza = !hasFilter && cate !== "app";

  const resetFilters = () => {
    setCate(undefined);
    setTag(undefined);
    setBrand(undefined);
    setQuery("");
    setFavoritesOnly(false);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-400">
        Catalog
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-950">产品列表</h1>
      <p className="mt-1 text-sm text-ink-500">
        {showLivePlaza ? (
          "实时模型广场与精选产品目录"
        ) : (
          <>
            共 <span className="font-mono text-ink-800">{list.length}</span> 个产品
            {hasFilter ? "（已应用筛选）" : ""}
          </>
        )}
      </p>

      <div className="mt-6 flex flex-col gap-3 border-y border-line py-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex max-w-md items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-ink-400 focus-within:border-primary-300 focus-within:ring-2 focus-within:ring-primary-100">
          <Search className="h-4 w-4 shrink-0" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="在当前结果中搜索" placeholder="在当前结果中搜索" className="min-w-0 flex-1 bg-transparent text-sm text-ink-800 outline-none placeholder:text-ink-300" />
          {query && <button type="button" onClick={() => setQuery("")} aria-label="清除搜索" className="text-ink-400 hover:text-ink-700"><X className="h-4 w-4" /></button>}
        </label>
        <button type="button" onClick={() => setFavoritesOnly((current) => !current)} aria-pressed={favoritesOnly} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${favoritesOnly ? "border-rose-200 bg-rose-50 text-rose-600" : "border-line bg-surface text-ink-600 hover:border-line-strong"}`}>
          <Heart className={`h-3.5 w-3.5 ${favoritesOnly ? "fill-current" : ""}`} />
          已收藏 {favorites.length ? `(${favorites.length})` : ""}
        </button>
      </div>

      <PublicModelPlaza />

      {/* 类型 tab */}
      <div className="mt-6 flex flex-wrap gap-2">
        {cateOptions.map((opt) => (
          <button
            key={opt.name}
            type="button"
            onClick={() => {
              setCate(opt.slug);
              setTag(undefined);
              setBrand(undefined);
              setQuery("");
              setFavoritesOnly(false);
            }}
            className={`${chipBase} ${cate === opt.slug ? chipActive : chipIdle}`}
          >
            {opt.name}
          </button>
        ))}
      </div>

      {/* 类目 */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setTag(undefined);
            setBrand(undefined);
          }}
          className={`${chipBase} text-xs ${!tag ? chipActive : chipIdle}`}
        >
          <span className="spectrum-bg h-1.5 w-1.5 rounded-full" aria-hidden />
          全部类目
        </button>
        {visibleCats.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => {
              setTag(c.slug);
              setBrand(undefined);
            }}
            className={`${chipBase} text-xs ${tag === c.slug ? chipActive : chipIdle}`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: c.color }}
            />
            {c.name}
          </button>
        ))}
      </div>

      {/* 品牌 */}
      {visibleBrands.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setBrand(undefined)}
            className={`${chipBase} text-xs ${!brand ? chipActive : chipIdle}`}
          >
            全部品牌
          </button>
          {visibleBrands.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBrand(b)}
              className={`${chipBase} text-xs ${brand === b ? chipActive : chipIdle}`}
            >
              {b}
            </button>
          ))}
        </div>
      )}

      {/* 结果 */}
      {showLivePlaza ? (
        <section className="mt-6"><div className="mb-4 flex items-center justify-between"><p className="text-sm text-ink-500">模型数据来自公开模型广场，实时同步价格与能力。</p><span className="font-mono text-xs text-ink-400">PUBLIC PRICING</span></div><RealModelGrid limit={24} compact /></section>
      ) : list.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong py-20 text-center"><PackageSearch className="h-10 w-10 text-ink-300" /><p className="text-sm text-ink-500">没有符合条件的产品</p><button type="button" onClick={resetFilters} className="flex items-center gap-1 rounded-lg border border-line bg-surface px-4 py-2 text-sm text-ink-700 transition hover:border-primary-200 hover:text-primary-600"><X className="h-3.5 w-3.5" />清除筛选</button></div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{list.map((product) => <ProductCard key={product.id} product={product} />)}</div>
      )}
    </div>
  );
}
