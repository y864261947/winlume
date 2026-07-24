"use client";

import { ChevronLeft, ChevronRight, Sparkles, Trash2 } from "lucide-react";
import type { Ref } from "react";
import type { SkillMeta } from "@/lib/agent/types";

export type MenuView =
  | { kind: "root" }
  | { kind: "department"; departmentId: string };

export type SkillDepartment = {
  id: string;
  label: string;
  count: number;
};

export type NavigableItem =
  | { type: "skill"; skill: SkillMeta }
  | { type: "department"; id: string; label: string; count: number }
  | { type: "action"; action: "clear-turn" };

const FEATURED_MAX = 12;
const SEARCH_MAX = 24;
const DEPT_SKILL_MAX = 40;

export function filterSkills(skills: SkillMeta[], query: string): SkillMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((s) => {
    const hay = [s.id, s.name, s.description, s.category, ...(s.triggers ?? [])]
      .join("\n")
      .toLowerCase();
    return hay.includes(q);
  });
}

/** Build keyboard-navigable rows for the current view / search query. */
export function getSlashMenuItems(
  skills: SkillMeta[],
  departments: SkillDepartment[],
  query: string,
  view: MenuView,
): NavigableItem[] {
  const q = query.trim();
  if (q) {
    return filterSkills(skills, q)
      .slice(0, SEARCH_MAX)
      .map((skill) => ({ type: "skill" as const, skill }));
  }

  if (view.kind === "department") {
    return skills
      .filter((s) => s.category === view.departmentId)
      .slice(0, DEPT_SKILL_MAX)
      .map((skill) => ({ type: "skill" as const, skill }));
  }

  const featured = skills
    .filter((s) => s.featured === true)
    .slice(0, FEATURED_MAX)
    .map((skill) => ({ type: "skill" as const, skill }));

  const depts = departments.map((d) => ({
    type: "department" as const,
    id: d.id,
    label: d.label,
    count: d.count,
  }));

  return [
    ...featured,
    ...depts,
    { type: "action" as const, action: "clear-turn" as const },
  ];
}

export type SkillSlashMenuProps = {
  open: boolean;
  query: string;
  skills: SkillMeta[];
  departments: SkillDepartment[];
  selectedIds: string[];
  loading?: boolean;
  highlightIndex: number;
  onHighlightIndexChange: (index: number) => void;
  view: MenuView;
  onViewChange: (view: MenuView) => void;
  onPickSkill: (skill: SkillMeta) => void;
  onClearTurnSkills: () => void;
  menuId?: string;
  menuRef?: Ref<HTMLDivElement>;
};

export default function SkillSlashMenu({
  open,
  query,
  skills,
  departments,
  selectedIds,
  loading = false,
  highlightIndex,
  onHighlightIndexChange,
  view,
  onViewChange,
  onPickSkill,
  onClearTurnSkills,
  menuId,
  menuRef,
}: SkillSlashMenuProps) {
  if (!open) return null;

  const q = query.trim();
  const searching = Boolean(q);
  const items = getSlashMenuItems(skills, departments, query, view);

  const departmentLabel =
    view.kind === "department"
      ? (departments.find((d) => d.id === view.departmentId)?.label ??
        view.departmentId)
      : null;

  const featuredCount =
    !searching && view.kind === "root"
      ? Math.min(FEATURED_MAX, skills.filter((s) => s.featured === true).length)
      : 0;

  const headerHint = loading
    ? "加载 Skills…"
    : searching
      ? `筛选「${q}」· ↑↓ 选择 · Enter 确认`
      : view.kind === "department"
        ? `${departmentLabel} · Esc 返回 · Enter 添加`
        : "精选 / 部门 · 输入搜索 · Enter 确认";

  const activate = (item: NavigableItem) => {
    if (item.type === "skill") {
      onPickSkill(item.skill);
      return;
    }
    if (item.type === "department") {
      onViewChange({ kind: "department", departmentId: item.id });
      onHighlightIndexChange(0);
      return;
    }
    if (item.type === "action" && item.action === "clear-turn") {
      onClearTurnSkills();
    }
  };

  return (
    <div
      ref={menuRef}
      id={menuId}
      role="listbox"
      aria-label="选择 Skill"
      className="studio-glass absolute bottom-full left-0 z-20 mb-2 max-h-72 w-full max-w-md overflow-auto rounded-[16px] py-1"
    >
      <div className="flex items-center gap-2 border-b border-white/50 px-3 py-1.5 text-[11px] text-[#8A8298]">
        {view.kind === "department" && !searching ? (
          <button
            type="button"
            onClick={() => {
              onViewChange({ kind: "root" });
              onHighlightIndexChange(0);
            }}
            className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[#615A73] transition hover:bg-white/50 hover:text-[#241E36]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            返回
          </button>
        ) : null}
        <span className="min-w-0 flex-1 truncate">{headerHint}</span>
      </div>

      {loading && items.length === 0 ? (
        <p className="px-3 py-3 text-sm text-[#8A8298]">加载中…</p>
      ) : items.length === 0 ? (
        <p className="px-3 py-3 text-sm text-[#8A8298]">
          {searching
            ? "没有匹配的 Skill"
            : view.kind === "department"
              ? "该部门暂无 Skill"
              : "暂无可用 Skill"}
        </p>
      ) : (
        items.map((item, i) => {
          const active = i === highlightIndex;
          const showFeaturedHeader =
            !searching && view.kind === "root" && featuredCount > 0 && i === 0;
          const showDeptHeader =
            !searching &&
            view.kind === "root" &&
            item.type === "department" &&
            i === featuredCount;
          const showActionSep =
            item.type === "action" && item.action === "clear-turn";

          return (
            <div key={rowKey(item)}>
              {showFeaturedHeader ? (
                <div className="px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-[#8A8298]">
                  精选
                </div>
              ) : null}
              {showDeptHeader ? (
                <div className="px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-[#8A8298]">
                  部门
                </div>
              ) : null}
              {showActionSep ? (
                <div className="my-1 border-t border-white/50" />
              ) : null}

              {item.type === "skill" ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => onHighlightIndexChange(i)}
                  onClick={() => onPickSkill(item.skill)}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition ${
                    active ? "bg-[rgba(194,65,12,0.08)]" : "hover:bg-white/50"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-[#241E36]">
                    {!searching && view.kind === "root" && item.skill.featured ? (
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#C2410C]" />
                    ) : null}
                    <span className="truncate">{item.skill.name}</span>
                    {selectedIds.includes(item.skill.id) ? (
                      <span className="shrink-0 rounded bg-[rgba(194,65,12,0.12)] px-1.5 text-[10px] text-[#C2410C]">
                        已选
                      </span>
                    ) : null}
                  </span>
                  <span className="line-clamp-1 text-xs text-[#8A8298]">
                    {item.skill.description || item.skill.id}
                  </span>
                </button>
              ) : null}

              {item.type === "department" ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => onHighlightIndexChange(i)}
                  onClick={() => activate(item)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left transition ${
                    active ? "bg-[rgba(194,65,12,0.08)]" : "hover:bg-white/50"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#241E36]">
                    {item.label}
                  </span>
                  <span className="shrink-0 text-[11px] text-[#8A8298]">
                    {item.count}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#8A8298]" />
                </button>
              ) : null}

              {item.type === "action" ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => onHighlightIndexChange(i)}
                  onClick={() => activate(item)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                    active
                      ? "bg-[rgba(239,71,112,0.1)] text-[#C2410C]"
                      : "text-[#615A73] hover:bg-white/50 hover:text-[#C2410C]"
                  }`}
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  清空本轮技能
                </button>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}

function rowKey(item: NavigableItem): string {
  if (item.type === "skill") return `skill-${item.skill.id}`;
  if (item.type === "department") return `dept-${item.id}`;
  return `action-${item.action}`;
}

/** Activate highlighted menu item (for Enter / Tab from parent). */
export function activateSlashMenuItem(
  item: NavigableItem | undefined,
  handlers: {
    onPickSkill: (skill: SkillMeta) => void;
    onViewChange: (view: MenuView) => void;
    onClearTurnSkills: () => void;
    onHighlightIndexChange: (i: number) => void;
  },
): boolean {
  if (!item) return false;
  if (item.type === "skill") {
    handlers.onPickSkill(item.skill);
    return true;
  }
  if (item.type === "department") {
    handlers.onViewChange({ kind: "department", departmentId: item.id });
    handlers.onHighlightIndexChange(0);
    return true;
  }
  if (item.type === "action" && item.action === "clear-turn") {
    handlers.onClearTurnSkills();
    return true;
  }
  return false;
}
