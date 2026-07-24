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

type Department = {
  id: string;
  label: string;
  count: number;
};

export default function StudioSkillsPage() {
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  /** `all` or department id */
  const [department, setDepartment] = useState("all");
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
      if (department && department !== "all") {
        params.set("category", department);
      }
      const res = await fetch(`/api/skills?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        throw new Error("加载 Skills 失败");
      }
      const data = (await res.json()) as {
        skills: SkillMeta[];
        departments?: Department[];
        total?: number;
      };
      const list = data.skills ?? [];
      setSkills(list);
      setTotal(typeof data.total === "number" ? data.total : list.length);
      if (data.departments?.length) {
        setDepartments(data.departments);
      }
      setSelected((prev) => {
        if (!prev) return list[0] ?? null;
        return list.find((s) => s.id === prev.id) ?? list[0] ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      setSkills([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, department]);

  useEffect(() => {
    void load();
  }, [load]);

  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of departments) map.set(d.id, d.label);
    return map;
  }, [departments]);

  const deptLabel = useCallback(
    (id: string) => labelById.get(id) || id,
    [labelById],
  );

  const allCount = useMemo(
    () => departments.reduce((sum, d) => sum + d.count, 0),
    [departments],
  );

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
              按部门浏览内置角色技能，选用示例提示词开始对话。
              {!loading && allCount > 0 ? (
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

        {/* Department tabs (mobile + top) */}
        <div className="mt-4 flex gap-1.5 overflow-x-auto pb-0.5 lg:hidden">
          <button
            type="button"
            onClick={() => setDepartment("all")}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              department === "all"
                ? "bg-primary-500 text-white"
                : "bg-canvas text-ink-600 hover:bg-primary-50"
            }`}
          >
            全部
            {allCount > 0 ? (
              <span className="ml-1 tabular-nums opacity-80">{allCount}</span>
            ) : null}
          </button>
          {departments.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDepartment(d.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                department === d.id
                  ? "bg-primary-500 text-white"
                  : "bg-canvas text-ink-600 hover:bg-primary-50"
              }`}
            >
              {d.label}
              <span className="ml-1 tabular-nums opacity-80">{d.count}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Left department list (desktop) */}
        <nav
          className="hidden w-52 shrink-0 overflow-y-auto border-r border-line bg-surface p-3 lg:block"
          aria-label="部门"
        >
          <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-ink-400">
            部门
          </p>
          <ul className="space-y-0.5">
            <li>
              <button
                type="button"
                onClick={() => setDepartment("all")}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
                  department === "all"
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
            {departments.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setDepartment(d.id)}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
                    department === d.id
                      ? "bg-primary-50 font-medium text-primary-700"
                      : "text-ink-700 hover:bg-canvas"
                  }`}
                >
                  <span className="truncate">{d.label}</span>
                  <span className="ml-2 shrink-0 tabular-nums text-xs text-ink-400">
                    {d.count}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

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
            <>
              <p className="mb-3 text-xs text-ink-400">
                当前列表 {total} 个
                {department !== "all" ? ` · ${deptLabel(department)}` : ""}
                {debouncedQ ? ` · 「${debouncedQ}」` : ""}
              </p>
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
                        <h2 className="text-sm font-semibold text-ink-900">
                          {skill.name}
                        </h2>
                        <span className="shrink-0 rounded-md bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-ink-500">
                          {deptLabel(skill.category)}
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
            </>
          )}
        </div>

        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-line bg-surface p-5 lg:block">
          {selected ? (
            <div className="space-y-4">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-ink-400">
                  {selected.id}
                </p>
                <h2 className="mt-1 text-lg font-bold text-ink-950">
                  {selected.name}
                </h2>
                <p className="mt-1 text-xs text-ink-400">
                  {deptLabel(selected.category)} · {selected.source}
                  {selected.featured ? " · 精选" : ""}
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
                将跳转到新对话并预填示例提示词与技能。
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
              <p className="truncate text-sm font-semibold text-ink-900">
                {selected.name}
              </p>
              <p className="truncate text-xs text-ink-400">
                {selected.description}
              </p>
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
