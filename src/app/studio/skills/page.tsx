"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LoaderCircle,
  Search,
  Sparkles,
  Tag,
  Wrench,
} from "lucide-react";
import type { SkillMeta } from "@/lib/agent/types";

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "营销",
  design: "设计",
  product: "产品",
  engineering: "工程",
  sales: "销售",
  support: "支持",
  finance: "财务",
  "project-management": "项目管理",
  testing: "测试",
  general: "通用",
};

function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] || cat;
}

export default function StudioSkillsPage() {
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<SkillMeta | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (category && category !== "all") params.set("category", category);
      const res = await fetch(`/api/skills?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        throw new Error("加载 Skills 失败");
      }
      const data = (await res.json()) as {
        skills: SkillMeta[];
        categories: string[];
      };
      setSkills(data.skills ?? []);
      setCategories(data.categories ?? []);
      setSelected((prev) => {
        if (!prev) return data.skills?.[0] ?? null;
        return data.skills?.find((s) => s.id === prev.id) ?? data.skills?.[0] ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, category]);

  useEffect(() => {
    void load();
  }, [load]);

  const useExampleHref = useMemo(() => {
    if (!selected) return "/studio";
    const params = new URLSearchParams();
    params.set("skill", selected.id);
    if (selected.examplePrompt) {
      params.set("prompt", selected.examplePrompt);
    }
    return `/studio?${params.toString()}`;
  }, [selected]);

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
              浏览内置角色技能，选用示例提示词开始对话。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink-800 outline-none ring-primary-500/30 focus:ring-2"
              aria-label="分类筛选"
            >
              <option value="all">全部分类</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-ink-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              正在加载 Skills…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
              <button
                type="button"
                onClick={() => void load()}
                className="ml-3 underline"
              >
                重试
              </button>
            </div>
          ) : skills.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-canvas px-6 py-12 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-ink-300" />
              <p className="mt-3 text-sm text-ink-500">没有匹配的 Skills</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {skills.map((skill) => {
                const active = selected?.id === skill.id;
                return (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => setSelected(skill)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-primary-300 bg-primary-50 shadow-sm"
                        : "border-line bg-surface hover:border-primary-200 hover:bg-canvas"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm font-semibold text-ink-900">{skill.name}</h2>
                      <span className="shrink-0 rounded-md bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
                        {categoryLabel(skill.category)}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-ink-500">
                      {skill.description || "暂无描述"}
                    </p>
                    {skill.triggers && skill.triggers.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {skill.triggers.slice(0, 3).map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-0.5 rounded-full bg-canvas px-2 py-0.5 text-[10px] text-ink-500"
                          >
                            <Tag className="h-2.5 w-2.5" />
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-line bg-surface p-5 lg:block">
          {selected ? (
            <div className="space-y-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-ink-400">
                  {selected.id}
                </p>
                <h2 className="mt-1 text-lg font-bold text-ink-950">{selected.name}</h2>
                <p className="mt-1 text-xs text-ink-400">
                  {categoryLabel(selected.category)} · {selected.source}
                </p>
              </div>
              <p className="text-sm leading-6 text-ink-600">
                {selected.description || "暂无描述"}
              </p>
              {selected.triggers && selected.triggers.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-ink-500">触发词</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {selected.triggers.map((t) => (
                      <span
                        key={t}
                        className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-600"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {selected.examplePrompt && (
                <div>
                  <p className="text-xs font-medium text-ink-500">示例提示</p>
                  <p className="mt-1.5 rounded-xl bg-canvas p-3 text-sm leading-6 text-ink-700">
                    {selected.examplePrompt}
                  </p>
                </div>
              )}
              <Link
                href={useExampleHref}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary-500 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-primary-600"
              >
                <Sparkles className="h-4 w-4" />
                使用示例
              </Link>
              <p className="text-[11px] leading-5 text-ink-400">
                将跳转到新对话并预填示例提示词；技能将在后续任务中接入消息选择器。
              </p>
            </div>
          ) : (
            <p className="text-sm text-ink-400">选择左侧卡片查看详情</p>
          )}
        </aside>
      </div>

      {/* Mobile detail bar */}
      {selected && (
        <div className="shrink-0 border-t border-line bg-surface p-4 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">{selected.name}</p>
              <p className="truncate text-xs text-ink-400">{selected.description}</p>
            </div>
            <Link
              href={useExampleHref}
              className="shrink-0 rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white"
            >
              使用示例
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
