"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  DRAW_TEMPLATE_CATEGORIES,
  DRAW_TEMPLATES,
  type DrawTemplate,
} from "@/lib/studio/draw-templates";

export default function DrawTemplateGallery({
  onApply,
}: {
  onApply: (template: DrawTemplate) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof DRAW_TEMPLATE_CATEGORIES)[number]>("全部");
  const templates = useMemo(() => {
    const q = query.trim();
    return DRAW_TEMPLATES.filter((item) => {
      if (category !== "全部" && item.category !== category) return false;
      if (!q) return true;
      return item.title.includes(q) || item.prompt.includes(q);
    });
  }, [category, query]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[22px] font-semibold tracking-tight text-ink-950">爆款模板库</h2>
          <p className="mt-1 text-xs leading-5 text-ink-500">
            套用结构与风格，再上传商品图生成同款。点「做同款」不会扣费。
          </p>
        </div>
        <label className="flex h-9 w-full max-w-[280px] items-center gap-2 rounded-full border border-line bg-surface px-3 text-ink-400">
          <Search className="size-3.5 shrink-0" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索模板名称 / 关键词"
            className="min-w-0 flex-1 bg-transparent text-xs text-ink-900 outline-none placeholder:text-ink-400"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {DRAW_TEMPLATE_CATEGORIES.map((item) => {
          const active = item === category;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`h-[26px] rounded-full px-3 text-xs transition-[background-color,color,transform] duration-100 ease-out active:scale-[0.97] ${
                active
                  ? "bg-ink-950 text-[var(--color-canvas)]"
                  : "border border-line bg-surface text-ink-600 hover:text-ink-950"
              }`}
            >
              {item}
            </button>
          );
        })}
      </div>
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-1 content-start gap-3 overflow-y-auto pb-6 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <article
            key={template.id}
            className="overflow-hidden rounded-[14px] border border-line bg-surface"
          >
            <div className="aspect-[3/2] overflow-hidden bg-canvas">
              {/* eslint-disable-next-line @next/next/no-img-element -- static prototype stills. */}
              <img src={template.src} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="flex items-center gap-2 px-3 py-3">
              <p className="min-w-0 flex-1 truncate text-xs font-medium text-ink-900">{template.title}</p>
              <button
                type="button"
                onClick={() => onApply(template)}
                className="inline-flex h-[23px] items-center rounded-full bg-ink-950 px-2 text-[11px] font-medium text-[var(--color-canvas)] transition-transform duration-100 ease-out active:scale-[0.97]"
              >
                {template.count} 做同款
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
