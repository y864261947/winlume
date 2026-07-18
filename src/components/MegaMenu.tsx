"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { categoriesByCate, categoryTint, CateSlug, cateTabs } from "@/data/taxonomy";

interface MegaMenuProps {
  open: boolean;
  onEnter: () => void;
  onNavigate: () => void;
}

export default function MegaMenu({ open, onEnter, onNavigate }: MegaMenuProps) {
  const [tab, setTab] = useState<CateSlug>("api");
  const [activeCat, setActiveCat] = useState("llm");

  if (!open) return null;

  const cats = categoriesByCate(tab);
  const current = cats.find((c) => c.slug === activeCat) ?? cats[0];

  // hover 与键盘 focus 共用同一套切换逻辑
  const selectTab = (slug: CateSlug) => {
    setTab(slug);
    const first = categoriesByCate(slug)[0];
    if (first) setActiveCat(first.slug);
  };

  return (
    <div
      onMouseEnter={onEnter}
      className="menu-pop absolute inset-x-0 top-full border-b border-line bg-surface/95 shadow-2xl shadow-ink-950/10 backdrop-blur-xl"
    >
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-5 flex gap-2">
          {cateTabs.map((t) => (
            <button
              key={t.slug}
              type="button"
              onMouseEnter={() => selectTab(t.slug)}
              onFocus={() => selectTab(t.slug)}
              onClick={() => selectTab(t.slug)}
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                tab === t.slug
                  ? "bg-primary-50 font-medium text-primary-600 ring-1 ring-primary-200"
                  : "text-ink-500 ring-1 ring-line hover:text-ink-900"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-6">
          <ul className="col-span-4 space-y-0.5 lg:col-span-3">
            {cats.map((c) => {
              const Icon = c.icon;
              const active = current.slug === c.slug;
              return (
                <li key={c.slug}>
                  <Link
                    href={`/products?cate=${tab}&tag=${c.slug}`}
                    onClick={onNavigate}
                    onMouseEnter={() => setActiveCat(c.slug)}
                    onFocus={() => setActiveCat(c.slug)}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition ${
                      active
                        ? "bg-canvas font-medium text-ink-900"
                        : "text-ink-600 hover:bg-canvas hover:text-ink-900"
                    }`}
                  >
                    <Icon
                      className="h-4 w-4"
                      style={{ color: active ? c.color : "var(--color-ink-400)" }}
                    />
                    {c.name}
                    {active && (
                      <ArrowRight className="ml-auto h-3.5 w-3.5" style={{ color: c.color }} />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="col-span-8 border-l border-line pl-6 lg:col-span-9">
            <p className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-ink-400">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: current.color }}
              />
              {current.name} · 品牌
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
              {current.brands.map((brand) => (
                <Link
                  key={brand}
                  href={`/products?cate=${tab}&tag=${current.slug}&brand=${encodeURIComponent(brand)}`}
                  onClick={onNavigate}
                  className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm text-ink-700 transition hover:border-primary-200 hover:bg-primary-50/40"
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold"
                    style={categoryTint(current.color)}
                  >
                    {brand.slice(0, 1)}
                  </span>
                  <span className="truncate">{brand}</span>
                </Link>
              ))}
            </div>
            <Link
              href={`/products?cate=${tab}&tag=${current.slug}`}
              onClick={onNavigate}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 transition hover:text-primary-500"
            >
              查看全部{current.name}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
