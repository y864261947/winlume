"use client";

import { ChevronLeft, ChevronRight, Scissors, Sparkles, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState, type Ref, type RefObject } from "react";
import type { SkillMeta } from "@/lib/agent/types";
import { listStudioTools, type StudioTool } from "@/lib/studio/tool-catalog";

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
  | { type: "tool"; tool: StudioTool }
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

export function filterStudioTools(tools: readonly StudioTool[], query: string): StudioTool[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...tools];
  return tools.filter((tool) => {
    const hay = [tool.id, tool.name, tool.summary, tool.description, ...tool.triggers]
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
  tools: readonly StudioTool[] = listStudioTools(),
): NavigableItem[] {
  const q = query.trim();
  if (q) {
    return [
      ...filterStudioTools(tools, q).map((tool) => ({ type: "tool" as const, tool })),
      ...filterSkills(skills, q)
        .slice(0, SEARCH_MAX)
        .map((skill) => ({ type: "skill" as const, skill })),
    ];
  }

  if (view.kind === "department") {
    return skills
      .filter((s) => s.category === view.departmentId)
      .slice(0, DEPT_SKILL_MAX)
      .map((skill) => ({ type: "skill" as const, skill }));
  }

  const toolItems = tools.map((tool) => ({ type: "tool" as const, tool }));
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
    ...toolItems,
    ...featured,
    ...depts,
    { type: "action" as const, action: "clear-turn" as const },
  ];
}

const MENU_GAP = 8;
const MENU_PAD = 8;
const MENU_MAX_HEIGHT = 384;
const MENU_MIN_HEIGHT = 96;

export function placeMenuAroundAnchor(
  anchor: { top: number; bottom: number; left: number },
  menu: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number; maxHeight: number; placement: "above" | "below" } {
  const spaceAbove = anchor.top - MENU_PAD - MENU_GAP;
  const spaceBelow = viewport.height - anchor.bottom - MENU_PAD - MENU_GAP;
  const placeAbove = spaceAbove >= Math.min(menu.height, MENU_MIN_HEIGHT) || spaceAbove >= spaceBelow;
  const available = Math.max(MENU_MIN_HEIGHT, placeAbove ? spaceAbove : spaceBelow);
  const maxHeight = Math.min(MENU_MAX_HEIGHT, available);
  const height = Math.min(menu.height, maxHeight);
  const left = Math.max(MENU_PAD, Math.min(anchor.left, viewport.width - menu.width - MENU_PAD));
  const top = placeAbove ? anchor.top - height - MENU_GAP : anchor.bottom + MENU_GAP;
  return {
    left,
    top: Math.max(MENU_PAD, top),
    maxHeight,
    placement: placeAbove ? "above" : "below",
  };
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else ref.current = value;
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
  onPickTool?: (tool: StudioTool) => void;
  onClearTurnSkills: () => void;
  menuId?: string;
  menuRef?: Ref<HTMLDivElement>;
  anchorRef: RefObject<HTMLElement | null>;
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
  onPickTool,
  onClearTurnSkills,
  menuId,
  menuRef,
  anchorRef,
}: SkillSlashMenuProps) {
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    maxHeight: number;
    ready: boolean;
  } | null>(null);
  const menuNodeRef = useRef<HTMLDivElement | null>(null);

  const setMenuNode = (node: HTMLDivElement | null) => {
    menuNodeRef.current = node;
    assignRef(menuRef, node);
  };

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      const menu = menuNodeRef.current;
      if (!anchor || !menu) return;
      const rect = anchor.getBoundingClientRect();
      const next = placeMenuAroundAnchor(
        rect,
        {
          width: menu.offsetWidth || Math.min(480, window.innerWidth - MENU_PAD * 2),
          height: menu.scrollHeight || menu.offsetHeight || MENU_MAX_HEIGHT,
        },
        { width: window.innerWidth, height: window.innerHeight },
      );
      setPosition((current) => {
        if (
          current &&
          current.left === next.left &&
          current.top === next.top &&
          current.maxHeight === next.maxHeight &&
          current.ready
        ) {
          return current;
        }
        return { ...next, ready: true };
      });
    };

    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    if (menuNodeRef.current) observer.observe(menuNodeRef.current);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, departments, loading, menuRef, open, query, skills, view]);

  if (!open || typeof document === "undefined") return null;

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
        : "工具 / 精选 / 部门 · 输入搜索 · Enter 确认";

  const activate = (item: NavigableItem) => {
    if (item.type === "skill") {
      onPickSkill(item.skill);
      return;
    }
    if (item.type === "tool") {
      onPickTool?.(item.tool);
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

  return createPortal(
    <div
      ref={setMenuNode}
      id={menuId}
      role="listbox"
      aria-label="选择 Skill"
      data-ready={position?.ready ? "true" : "false"}
      className="studio-liquid-glass skill-slash-menu fixed z-[70] w-[min(30rem,calc(100vw-1rem))] overflow-x-hidden overflow-y-auto rounded-[16px] py-1"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        maxHeight: position?.maxHeight ?? MENU_MAX_HEIGHT,
        visibility: position?.ready ? "visible" : "hidden",
        pointerEvents: position?.ready ? "auto" : "none",
      }}
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
            ? "没有匹配的工具或 Skill"
            : view.kind === "department"
              ? "该部门暂无 Skill"
              : "暂无可用 Skill"}
        </p>
      ) : (
        items.map((item, i) => {
          const active = i === highlightIndex;
          const toolCount = !searching && view.kind === "root"
            ? items.filter((entry) => entry.type === "tool").length
            : 0;
          const showToolHeader =
            !searching && view.kind === "root" && item.type === "tool" && i === 0;
          const showFeaturedHeader =
            !searching &&
            view.kind === "root" &&
            featuredCount > 0 &&
            item.type === "skill" &&
            i === toolCount;
          const showDeptHeader =
            !searching &&
            view.kind === "root" &&
            item.type === "department" &&
            i === toolCount + featuredCount;
          const showActionSep =
            item.type === "action" && item.action === "clear-turn";

          return (
            <div key={rowKey(item)}>
              {showToolHeader ? (
                <div className="px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wide text-[#8A8298]">
                  工具
                </div>
              ) : null}
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

              {item.type === "tool" ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => onHighlightIndexChange(i)}
                  onClick={() => onPickTool?.(item.tool)}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition ${
                    active ? "bg-[rgba(15, 23, 42,0.08)]" : "hover:bg-white/50"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-[#241E36]">
                    <Scissors className="h-3.5 w-3.5 shrink-0 text-[#0F172A]" />
                    <span className="truncate">{item.tool.name}</span>
                    <span className="shrink-0 rounded bg-[rgba(15, 23, 42,0.12)] px-1.5 text-[10px] text-[#0F172A]">
                      工具
                    </span>
                  </span>
                  <span className="line-clamp-1 text-xs text-[#8A8298]">
                    {item.tool.summary}
                  </span>
                </button>
              ) : null}

              {item.type === "skill" ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => onHighlightIndexChange(i)}
                  onClick={() => onPickSkill(item.skill)}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition ${
                    active ? "bg-[rgba(15, 23, 42,0.08)]" : "hover:bg-white/50"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-[#241E36]">
                    {!searching && view.kind === "root" && item.skill.featured ? (
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#0F172A]" />
                    ) : null}
                    <span className="truncate">{item.skill.name}</span>
                    {selectedIds.includes(item.skill.id) ? (
                      <span className="shrink-0 rounded bg-[rgba(15, 23, 42,0.12)] px-1.5 text-[10px] text-[#0F172A]">
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
                    active ? "bg-[rgba(15, 23, 42,0.08)]" : "hover:bg-white/50"
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
                      ? "bg-[rgba(239,71,112,0.1)] text-[#0F172A]"
                      : "text-[#615A73] hover:bg-white/50 hover:text-[#0F172A]"
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
    </div>,
    document.body,
  );
}

function rowKey(item: NavigableItem): string {
  if (item.type === "skill") return `skill-${item.skill.id}`;
  if (item.type === "tool") return `tool-${item.tool.id}`;
  if (item.type === "department") return `dept-${item.id}`;
  return `action-${item.action}`;
}

/** Activate highlighted menu item (for Enter / Tab from parent). */
export function activateSlashMenuItem(
  item: NavigableItem | undefined,
  handlers: {
    onPickSkill: (skill: SkillMeta) => void;
    onPickTool?: (tool: StudioTool) => void;
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
  if (item.type === "tool") {
    handlers.onPickTool?.(item.tool);
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
