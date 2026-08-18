"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, Search, Wrench } from "lucide-react";
import SkillWaterfall from "@/components/studio/SkillWaterfall";
import { WorkflowPackSection } from "@/components/studio/workflow/WorkflowPackSection";
import {
  getStudioToolCategory,
  isStudioToolCategoryId,
  type StudioCatalogCount,
} from "@/lib/studio/tool-categories";

function StudioSkillsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const scene = searchParams.get("scene")?.trim() || "";
  const catalogParam = searchParams.get("catalog")?.trim() || "all";
  const catalog =
    catalogParam === "all" || isStudioToolCategoryId(catalogParam)
      ? catalogParam
      : "all";
  const [catalogs, setCatalogs] = useState<StudioCatalogCount[]>([]);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/skills?limit=1", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("catalogs");
        return res.json() as Promise<{ catalogs?: StudioCatalogCount[] }>;
      })
      .then((data) => {
        if (!cancelled && data.catalogs?.length) setCatalogs(data.catalogs);
      })
      .catch(() => {
        if (!cancelled) setCatalogs([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setCatalogFilter = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!next || next === "all") params.delete("catalog");
      else params.set("catalog", next);
      const query = params.toString();
      router.replace(query ? `/studio/skills?${query}` : "/studio/skills");
    },
    [router, searchParams],
  );

  const allCount = useMemo(
    () => catalogs.reduce((sum, item) => sum + item.count, 0),
    [catalogs],
  );
  const catalogName =
    catalog !== "all" ? getStudioToolCategory(catalog)?.name : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-line bg-surface px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-ink-950">
              <Wrench className="h-5 w-5 text-primary-500" />
              Skills
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              往下刷即可，点卡片挂到工作台。
              {allCount > 0 ? (
                <span className="ml-1 tabular-nums text-ink-400">
                  （共 {allCount} 个）
                </span>
              ) : null}
            </p>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索名称、描述、触发词…"
              className="w-56 rounded-lg border border-line bg-canvas py-2 pl-9 pr-3 text-sm text-ink-900 outline-none ring-primary-500/30 placeholder:text-ink-400 focus:ring-2 sm:w-72"
            />
          </label>
        </div>

        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-0.5 lg:hidden">
          <button
            type="button"
            onClick={() => setCatalogFilter("all")}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              catalog === "all"
                ? "bg-primary-500 text-white"
                : "bg-canvas text-ink-600 hover:bg-primary-50"
            }`}
          >
            全部
            {allCount > 0 ? (
              <span className="ml-1 tabular-nums opacity-80">{allCount}</span>
            ) : null}
          </button>
          {catalogs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setCatalogFilter(item.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                catalog === item.id
                  ? "bg-primary-500 text-white"
                  : "bg-canvas text-ink-600 hover:bg-primary-50"
              }`}
            >
              {item.name}
              <span className="ml-1 tabular-nums opacity-80">{item.count}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav
          className="hidden w-52 shrink-0 overflow-y-auto border-r border-line bg-surface p-3 lg:block"
          aria-label="工作台分类"
        >
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
            分类
          </p>
          <ul className="space-y-0.5">
            <li>
              <button
                type="button"
                onClick={() => setCatalogFilter("all")}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
                  catalog === "all"
                    ? "bg-primary-50 font-medium text-primary-700"
                    : "text-ink-700 hover:bg-canvas"
                }`}
              >
                <span>全部</span>
                <span className="tabular-nums text-xs text-ink-400">
                  {allCount || "—"}
                </span>
              </button>
            </li>
            {catalogs.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setCatalogFilter(item.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    catalog === item.id
                      ? "bg-primary-50 font-medium text-primary-700"
                      : "text-ink-700 hover:bg-canvas"
                  }`}
                >
                  <span className="truncate">{item.name}</span>
                  <span className="ml-2 shrink-0 tabular-nums text-xs text-ink-400">
                    {item.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <WorkflowPackSection scene={scene} query={debouncedQ} />
          <SkillWaterfall
            catalog={catalog}
            query={debouncedQ}
            heading={catalogName ?? "技能"}
          />
        </div>
      </div>
    </div>
  );
}

function StudioSkillsFallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center gap-2 px-6 text-sm text-ink-500">
      <LoaderCircle className="h-4 w-4 animate-spin" />
      正在加载 Skills…
    </div>
  );
}

export default function StudioSkillsPage() {
  return (
    <Suspense fallback={<StudioSkillsFallback />}>
      <StudioSkillsPageContent />
    </Suspense>
  );
}
