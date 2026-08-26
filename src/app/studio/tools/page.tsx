"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";
import SkillWaterfall from "@/components/studio/SkillWaterfall";
import StudioCatalogFilter from "@/components/studio/StudioCatalogFilter";
import { catalogAccentStyle } from "@/lib/studio/skill-mark";
import {
  getStudioToolCategory,
  isStudioToolCategoryId,
  type StudioToolCategoryId,
} from "@/lib/studio/tool-categories";
import { studioToolHref } from "@/lib/studio/studio-mode";
import {
  listStudioTools,
  listStudioToolsByCategory,
} from "@/lib/studio/tool-catalog";

function parseCatalog(raw: string | null): "all" | StudioToolCategoryId {
  const value = raw?.trim();
  if (!value || value === "all") return "all";
  return isStudioToolCategoryId(value) ? value : "all";
}

function StudioToolsCatalog() {
  const searchParams = useSearchParams();
  const catalog = parseCatalog(searchParams.get("catalog"));
  const category = catalog === "all" ? null : getStudioToolCategory(catalog);
  const tools =
    catalog === "all" ? listStudioTools() : listStudioToolsByCategory(catalog);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-5 py-7 max-sm:pt-14 sm:px-6 sm:py-9">
        <header>
          <h1 className="text-xl font-bold tracking-tight text-ink-950">
            全部工具
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            {category
              ? category.summary
              : "点卡片挂到工作台，或打开一个固定工具。"}
          </p>
        </header>

        <StudioCatalogFilter active={catalog} />

        {tools.length > 0 ? (
          <section className="pt-5" aria-labelledby="category-tools-heading">
            <h2
              id="category-tools-heading"
              className="text-sm font-semibold tracking-tight text-ink-900"
            >
              工具
              <span className="ml-1.5 font-normal tabular-nums text-ink-400">
                {tools.length}
              </span>
            </h2>
            <div className="studio-catalog-grid mt-3">
              {tools.map((tool) => {
                const tag = getStudioToolCategory(tool.category);
                const ToolIcon = tag?.icon;
                return (
                  <Link
                    key={tool.id}
                    href={studioToolHref(tool.id)}
                    className="studio-catalog-card"
                    style={catalogAccentStyle(tag?.accent ?? "#64748b")}
                  >
                    {ToolIcon ? (
                      <span className="studio-catalog-mark">
                        <ToolIcon className="h-4 w-4" />
                      </span>
                    ) : null}
                    <h3 className="mt-4 line-clamp-2 text-sm font-semibold tracking-tight text-ink-900">
                      {tool.name}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-ink-500">
                      {tool.summary}
                    </p>
                    <span className="mt-auto inline-flex items-center gap-1 pt-4 text-[13px] font-medium text-ink-700">
                      打开工具
                      <ArrowRight className="studio-catalog-card-go h-3.5 w-3.5" />
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        <div className={tools.length > 0 ? "pt-8" : "pt-5"}>
          <SkillWaterfall catalog={catalog} heading="技能" />
        </div>
      </div>
    </div>
  );
}

function StudioToolsFallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center gap-2 px-6 text-sm text-ink-500">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      正在加载工具…
    </div>
  );
}

export default function StudioToolsPage() {
  return (
    <Suspense fallback={<StudioToolsFallback />}>
      <StudioToolsCatalog />
    </Suspense>
  );
}
