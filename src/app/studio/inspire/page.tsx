"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Compass, Sparkles } from "lucide-react";
import type { SkillMeta } from "@/lib/agent/types";

/**
 * 灵感广场 — demo 对齐：浏览高质量示例提示，一键带入创作。
 */
export default function StudioInspirePage() {
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/skills", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("load");
        return res.json() as Promise<{ skills: SkillMeta[] }>;
      })
      .then((data) => {
        if (!cancelled) setSkills(data.skills ?? []);
      })
      .catch(() => {
        if (!cancelled) setSkills([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => {
    const withExample = skills.filter((s) => s.examplePrompt?.trim());
    const query = q.trim().toLowerCase();
    if (!query) return withExample;
    return withExample.filter((s) =>
      [s.name, s.description, s.category, s.examplePrompt, ...(s.triggers ?? [])]
        .join("\n")
        .toLowerCase()
        .includes(query),
    );
  }, [skills, q]);

  return (
    <div className="studio-view-in min-h-0 flex-1 overflow-y-auto px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-[1100px]">
        <header className="studio-fade-up mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#C2410C]">
              <Compass className="h-3.5 w-3.5" />
              灵感广场
            </p>
            <h1 className="text-[24px] font-bold tracking-tight text-[#241E36]">
              浏览高质量模板，一键套用风格
            </h1>
            <p className="mt-1.5 text-sm text-[#8A8298]">
              来自内置 Skills 的示例提示，点开即可带入「开始创作」。
            </p>
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索能力、模板或关键词…"
            className="studio-glass-soft w-full max-w-xs rounded-[12px] px-3.5 py-2.5 text-sm text-[#241E36] outline-none placeholder:text-[#8A8298] focus:ring-2 focus:ring-[rgba(194,65,12,0.25)] sm:w-72"
          />
        </header>

        {loading ? (
          <p className="text-sm text-[#8A8298]">加载灵感中…</p>
        ) : items.length === 0 ? (
          <div className="studio-glass rounded-[18px] px-6 py-10 text-center text-sm text-[#8A8298]">
            没有找到相关结果
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((skill, i) => (
              <Link
                key={skill.id}
                href={`/studio?skill=${encodeURIComponent(skill.id)}&prompt=${encodeURIComponent(skill.examplePrompt ?? "")}`}
                style={{ animationDelay: `${Math.min(i, 12) * 0.03}s` }}
                className="studio-glass studio-fade-up group block rounded-[18px] p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-[11px] bg-[rgba(194,65,12,0.1)] text-[#C2410C]">
                  <Sparkles className="h-4 w-4" />
                </span>
                <p className="text-[15px] font-semibold text-[#241E36] group-hover:text-[#C2410C]">
                  {skill.name}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-[#8A8298]">
                  {skill.description}
                </p>
                <p className="mt-3 line-clamp-3 rounded-[12px] bg-white/50 px-3 py-2 text-[12px] leading-5 text-[#615A73]">
                  {skill.examplePrompt}
                </p>
                <span className="mt-3 inline-block text-xs font-medium text-[#C2410C]">
                  使用此灵感 →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
