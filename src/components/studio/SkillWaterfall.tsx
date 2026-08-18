"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle, Sparkles } from "lucide-react";
import type { SkillMeta } from "@/lib/agent/types";
import { usableComposerPrompt } from "@/lib/studio/skill-prompt";

const PAGE_SIZE = 36;

function skillHref(skill: SkillMeta) {
  const params = new URLSearchParams();
  params.set("skill", skill.id);
  const prompt = usableComposerPrompt(skill.examplePrompt);
  if (prompt) params.set("prompt", prompt);
  return `/studio?${params.toString()}`;
}

function closestScrollRoot(node: Element | null): Element | null {
  let current = node?.parentElement ?? null;
  while (current) {
    const { overflowY } = getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll") return current;
    current = current.parentElement;
  }
  return null;
}

export default function SkillWaterfall({
  catalog,
  query,
  heading = "技能",
}: {
  catalog?: string;
  query?: string;
  heading?: string;
}) {
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (offset: number) => {
      const id = ++requestId.current;
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));
        if (catalog && catalog !== "all") params.set("catalog", catalog);
        if (query?.trim()) params.set("q", query.trim());
        const res = await fetch(`/api/skills?${params.toString()}`, {
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error("加载技能失败");
        const data = (await res.json()) as {
          skills?: SkillMeta[];
          total?: number;
          hasMore?: boolean;
        };
        if (id !== requestId.current) return;
        const page = data.skills ?? [];
        setSkills((current) => (offset === 0 ? page : [...current, ...page]));
        setTotal(typeof data.total === "number" ? data.total : page.length);
        setHasMore(Boolean(data.hasMore));
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : "加载失败");
        if (offset === 0) {
          setSkills([]);
          setTotal(0);
          setHasMore(false);
        }
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [catalog, query],
  );

  useEffect(() => {
    setSkills([]);
    setHasMore(false);
    const timer = window.setTimeout(() => {
      void load(0);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void load(skills.length);
        }
      },
      { root: closestScrollRoot(node), rootMargin: "480px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, load, loading, loadingMore, skills.length]);

  return (
    <section aria-labelledby="skill-waterfall-heading">
      <h2
        id="skill-waterfall-heading"
        className="text-sm font-semibold text-ink-900"
      >
        {heading}
        {total > 0 ? (
          <span className="ml-1.5 font-normal tabular-nums text-ink-400">
            {total}
          </span>
        ) : null}
      </h2>

      {loading && skills.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-ink-500">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          正在加载技能…
        </div>
      ) : error && skills.length === 0 ? (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load(0)}
            className="ml-auto font-medium underline underline-offset-2"
          >
            重试
          </button>
        </div>
      ) : skills.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-line bg-canvas px-6 py-12 text-center">
          <p className="text-sm text-ink-500">该分类暂无技能。</p>
        </div>
      ) : (
        <div className="mt-3 columns-1 gap-3 sm:columns-2 xl:columns-3">
          {skills.map((skill) => (
            <Link
              key={skill.id}
              href={skillHref(skill)}
              className="group mb-3 flex break-inside-avoid flex-col rounded-lg border border-line bg-surface p-4 transition hover:border-primary-300 hover:bg-primary-50/35"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-900">{skill.name}</h3>
                {skill.featured ? (
                  <span className="shrink-0 rounded-md bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-700">
                    精选
                  </span>
                ) : null}
              </div>
              {skill.description ? (
                <p className="mt-2 line-clamp-6 text-sm leading-5 text-ink-500">
                  {skill.description}
                </p>
              ) : null}
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary-700">
                <Sparkles className="h-3.5 w-3.5" />
                挂到工作台
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      )}

      <div ref={sentinelRef} className="h-8" aria-hidden="true" />
      {loadingMore ? (
        <div className="flex items-center justify-center gap-2 pb-6 text-sm text-ink-500">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          继续加载…
        </div>
      ) : null}
    </section>
  );
}
