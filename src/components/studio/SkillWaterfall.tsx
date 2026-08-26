"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import type { SkillMeta } from "@/lib/agent/types";
import { departmentLabel } from "@/lib/agent/skills/departments";
import { catalogAccentStyle, skillMonogram } from "@/lib/studio/skill-mark";
import { usableComposerPrompt } from "@/lib/studio/skill-prompt";
import {
  getStudioToolCategory,
  skillDepartmentToToolCategory,
} from "@/lib/studio/tool-categories";

const PAGE_SIZE = 36;
const SKELETON_COUNT = 6;

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

function SkillMark({
  name,
  iconUrl,
}: {
  name: string;
  iconUrl?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(iconUrl) && !broken;
  return (
    <span className="studio-catalog-mark" data-logo={showImage ? "true" : "false"} aria-hidden>
      {showImage ? (
        // SkillHub hosts logos on mixed CDNs; next/image remote allowlists would lag the catalog.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        skillMonogram(name)
      )}
    </span>
  );
}

function SkillCardSkeleton() {
  return (
    <div className="studio-catalog-card studio-catalog-card-skeleton" aria-hidden>
      <div className="flex items-start gap-3">
        <span className="studio-catalog-mark" />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <span className="block h-3.5 w-2/3 rounded-md bg-ink-300/25" />
          <span className="block h-2.5 w-14 rounded-md bg-ink-300/20" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <span className="block h-2.5 w-full rounded-md bg-ink-300/20" />
        <span className="block h-2.5 w-4/5 rounded-md bg-ink-300/15" />
      </div>
    </div>
  );
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
        className="text-sm font-semibold tracking-tight text-ink-900"
      >
        {heading}
        {total > 0 ? (
          <span className="ml-1.5 font-normal tabular-nums text-ink-400">
            {total}
          </span>
        ) : null}
      </h2>

      {loading && skills.length === 0 ? (
        <div
          className="studio-catalog-grid mt-3"
          aria-busy="true"
          aria-label="正在加载技能"
        >
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <SkillCardSkeleton key={index} />
          ))}
        </div>
      ) : error && skills.length === 0 ? (
        <div
          role="alert"
          className="mt-4 flex flex-wrap items-center gap-2 rounded-[14px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load(0)}
            className="ml-auto font-medium underline underline-offset-2 transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            重试
          </button>
        </div>
      ) : skills.length === 0 ? (
        <div className="mt-4 rounded-[14px] border border-dashed border-line bg-canvas px-6 py-12 text-center">
          <p className="text-sm text-ink-500">
            {query?.trim() ? "没有匹配的技能。" : "该分类暂无技能。"}
          </p>
        </div>
      ) : (
        <div className="studio-catalog-grid mt-3">
          {skills.map((skill) => {
            const tag = getStudioToolCategory(
              skillDepartmentToToolCategory(skill.category),
            );
            const dept = departmentLabel(skill.category);
            return (
              <Link
                key={skill.id}
                href={skillHref(skill)}
                className="studio-catalog-card"
                style={catalogAccentStyle(tag?.accent ?? "#64748b")}
              >
                <div className="flex items-start gap-3">
                  <SkillMark name={skill.name} iconUrl={skill.iconUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-5 tracking-tight text-ink-900">
                        {skill.name}
                      </h3>
                      {skill.featured ? (
                        <span className="studio-catalog-featured">精选</span>
                      ) : null}
                    </div>
                    {catalog && catalog !== "all" ? null : (
                      <span className="mt-1 inline-block text-[11px] leading-4 text-ink-400">
                        {dept}
                      </span>
                    )}
                  </div>
                </div>
                {skill.description ? (
                  <p className="mt-3 line-clamp-2 text-[13px] leading-5 text-ink-500">
                    {skill.description}
                  </p>
                ) : null}
                <span className="mt-auto inline-flex items-center gap-1 pt-4 text-[13px] font-medium text-ink-700">
                  挂到工作台
                  <ArrowRight className="studio-catalog-card-go h-3.5 w-3.5" />
                </span>
              </Link>
            );
          })}
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
