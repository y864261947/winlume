"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, ChevronDown, Square, Wrench } from "lucide-react";
import { fetchPlaza } from "@/lib/catalog";
import type { SkillMeta } from "@/lib/agent/types";
import SkillChips from "./SkillChips";
import SkillSlashMenu, {
  activateSlashMenuItem,
  getSlashMenuItems,
  type MenuView,
  type SkillDepartment,
} from "./SkillSlashMenu";

const FALLBACK_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "claude-3-5-sonnet",
  "deepseek-chat",
] as const;

const PLAZA_LIMIT = 30;

export type ComposerSendMeta = {
  skillIds?: string[];
};

export type ComposerProps = {
  value?: string;
  onChange?: (value: string) => void;
  onSend: (text: string, meta?: ComposerSendMeta) => void | Promise<void>;
  onStop?: () => void;
  streaming?: boolean;
  disabled?: boolean;
  model: string;
  onModelChange: (model: string) => void;
  placeholder?: string;
  /** Allow free-text model name when plaza fails or for custom models */
  allowCustomModel?: boolean;
  error?: string | null;
  onClearError?: () => void;
  /** Initial / controlled skill ids selected for the next message (turn) */
  skillIds?: string[];
  onSkillIdsChange?: (ids: string[]) => void;
  /** Session-pinned skill ids (parent may no-op until session page wired) */
  pinnedSkillIds?: string[];
  onPinnedSkillIdsChange?: (ids: string[]) => void;
};

export default function Composer({
  value: controlledValue,
  onChange,
  onSend,
  onStop,
  streaming = false,
  disabled = false,
  model,
  onModelChange,
  placeholder = "描述你想完成的任务…",
  allowCustomModel = true,
  error,
  onClearError,
  skillIds: skillIdsProp,
  onSkillIdsChange,
  pinnedSkillIds: pinnedSkillIdsProp,
  onPinnedSkillIdsChange,
}: ComposerProps) {
  const promptId = useId();
  const modelId = useId();
  const menuId = useId();
  const [uncontrolled, setUncontrolled] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([...FALLBACK_MODELS]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [customMode, setCustomMode] = useState(false);
  const [allSkills, setAllSkills] = useState<SkillMeta[]>([]);
  const [departments, setDepartments] = useState<SkillDepartment[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [internalSkillIds, setInternalSkillIds] = useState<string[]>([]);
  const [internalPinnedIds, setInternalPinnedIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuView, setMenuView] = useState<MenuView>({ kind: "root" });
  const [slashRange, setSlashRange] = useState<{ start: number; end: number } | null>(
    null,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isControlled = controlledValue !== undefined;
  const draft = isControlled ? controlledValue : uncontrolled;

  const skillIdsControlled = skillIdsProp !== undefined;
  const selectedIds = skillIdsControlled ? skillIdsProp : internalSkillIds;

  const pinnedControlled = pinnedSkillIdsProp !== undefined;
  const pinnedIds = pinnedControlled ? pinnedSkillIdsProp : internalPinnedIds;

  const setDraft = useCallback(
    (next: string) => {
      if (isControlled) onChange?.(next);
      else setUncontrolled(next);
    },
    [isControlled, onChange],
  );

  const setSelectedIds = useCallback(
    (next: string[] | ((prev: string[]) => string[])) => {
      const resolved = typeof next === "function" ? next(selectedIds) : next;
      if (!skillIdsControlled) setInternalSkillIds(resolved);
      onSkillIdsChange?.(resolved);
    },
    [selectedIds, skillIdsControlled, onSkillIdsChange],
  );

  const setPinnedIds = useCallback(
    (next: string[] | ((prev: string[]) => string[])) => {
      const resolved = typeof next === "function" ? next(pinnedIds) : next;
      if (!pinnedControlled) setInternalPinnedIds(resolved);
      onPinnedSkillIdsChange?.(resolved);
    },
    [pinnedIds, pinnedControlled, onPinnedSkillIdsChange],
  );

  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    fetchPlaza()
      .then((data) => {
        if (cancelled) return;
        const names = [
          ...new Set(
            data.models
              .map((m) => m.model_name)
              .filter((n): n is string => Boolean(n?.trim())),
          ),
        ].slice(0, PLAZA_LIMIT);
        if (names.length) {
          setModelOptions(names);
          if (model && !names.includes(model) && allowCustomModel) {
            setCustomMode(true);
          }
        }
      })
      .catch(() => {
        /* keep fallback list */
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load plaza once
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSkillsLoading(true);
    fetch("/api/skills", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error("skills");
        return res.json() as Promise<{
          skills: SkillMeta[];
          departments?: SkillDepartment[];
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        setAllSkills(data.skills ?? []);
        setDepartments(data.departments ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setAllSkills([]);
          setDepartments([]);
        }
      })
      .finally(() => {
        if (!cancelled) setSkillsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Ensure selected model is visible in options
  useEffect(() => {
    if (model && !modelOptions.includes(model) && !customMode) {
      setModelOptions((prev) => [model, ...prev.filter((m) => m !== model)]);
    }
  }, [model, modelOptions, customMode]);

  const skillsById = useMemo(() => {
    const map = new Map<string, SkillMeta>();
    for (const s of allSkills) map.set(s.id, s);
    return map;
  }, [allSkills]);

  const menuItems = useMemo(
    () => getSlashMenuItems(allSkills, departments, menuQuery, menuView),
    [allSkills, departments, menuQuery, menuView],
  );

  // Reset highlight when query / open / view changes
  useEffect(() => {
    setMenuIndex(0);
  }, [menuQuery, menuOpen, menuView]);

  // Keep highlight in range when item list shrinks
  useEffect(() => {
    if (menuItems.length === 0) return;
    if (menuIndex >= menuItems.length) {
      setMenuIndex(0);
    }
  }, [menuItems.length, menuIndex]);

  // When typing a search query, leave department drill (flat search)
  useEffect(() => {
    if (menuQuery.trim() && menuView.kind !== "root") {
      setMenuView({ kind: "root" });
    }
  }, [menuQuery, menuView.kind]);

  // Close slash menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (textareaRef.current?.contains(t)) return;
      setMenuOpen(false);
      setSlashRange(null);
      setMenuView({ kind: "root" });
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const canSend = Boolean(draft.trim()) && !disabled && !streaming;

  const toggleSkill = useCallback(
    (id: string) => {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    },
    [setSelectedIds],
  );

  const removeSkill = useCallback(
    (id: string) => {
      setSelectedIds((prev) => prev.filter((x) => x !== id));
    },
    [setSelectedIds],
  );

  const clearTurnSkills = useCallback(() => {
    setSelectedIds([]);
  }, [setSelectedIds]);

  const togglePin = useCallback(
    (id: string) => {
      setPinnedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    },
    [setPinnedIds],
  );

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuQuery("");
    setSlashRange(null);
    setMenuView({ kind: "root" });
  }, []);

  const pickSkillFromMenu = useCallback(
    (skill: SkillMeta) => {
      // Wrench-opened menu (no slash token): toggle; slash pick: add only
      if (!slashRange) {
        toggleSkill(skill.id);
        return;
      }
      setSelectedIds((prev) =>
        prev.includes(skill.id) ? prev : [...prev, skill.id],
      );
      if (textareaRef.current) {
        const el = textareaRef.current;
        const before = draft.slice(0, slashRange.start);
        const after = draft.slice(slashRange.end);
        const next = `${before}${after}`.replace(/\s{2,}/g, " ");
        setDraft(next);
        requestAnimationFrame(() => {
          const pos = before.length;
          el.focus();
          el.setSelectionRange(pos, pos);
        });
      }
      closeMenu();
    },
    [closeMenu, draft, setDraft, setSelectedIds, slashRange, toggleSkill],
  );

  const openSkillMenu = useCallback(
    (query = "", range: { start: number; end: number } | null = null) => {
      setMenuQuery(query);
      setSlashRange(range);
      setMenuView({ kind: "root" });
      setMenuOpen(true);
    },
    [],
  );

  const detectSlash = useCallback(
    (text: string, cursor: number) => {
      // Match `/query` token immediately before cursor (start of string or after whitespace)
      const upto = text.slice(0, cursor);
      const match = upto.match(/(?:^|[\s\n])\/([^\s/]*)$/);
      if (!match) {
        setMenuOpen(false);
        setSlashRange(null);
        setMenuQuery("");
        setMenuView({ kind: "root" });
        return;
      }
      const token = match[0];
      const slashLocal = token.lastIndexOf("/");
      const start = cursor - token.length + slashLocal;
      const query = match[1] ?? "";
      openSkillMenu(query, { start, end: cursor });
    },
    [openSkillMenu],
  );

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || disabled || streaming) return;
    onClearError?.();
    const ids = selectedIds.length ? [...selectedIds] : undefined;
    void onSend(text, ids ? { skillIds: ids } : undefined);
    setDraft("");
    setSelectedIds([]);
    closeMenu();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [
    draft,
    disabled,
    streaming,
    onSend,
    onClearError,
    setDraft,
    selectedIds,
    setSelectedIds,
    closeMenu,
  ]);

  const runMenuActivate = useCallback(() => {
    const item = menuItems[menuIndex];
    activateSlashMenuItem(item, {
      onPickSkill: pickSkillFromMenu,
      onViewChange: setMenuView,
      onClearTurnSkills: clearTurnSkills,
      onHighlightIndexChange: setMenuIndex,
    });
  }, [menuItems, menuIndex, pickSkillFromMenu, clearTurnSkills]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (menuOpen && menuItems.length) {
      runMenuActivate();
      return;
    }
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (menuItems.length) {
          setMenuIndex((i) => (i + 1) % menuItems.length);
        }
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (menuItems.length) {
          setMenuIndex((i) => (i - 1 + menuItems.length) % menuItems.length);
        }
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (menuItems.length) runMenuActivate();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        // Department drill: Esc → root first; then close
        if (
          menuView.kind === "department" &&
          !menuQuery.trim()
        ) {
          setMenuView({ kind: "root" });
          setMenuIndex(0);
          return;
        }
        closeMenu();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        if (menuItems.length) runMenuActivate();
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const onTextareaInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const turnCount = selectedIds.length;
  const pinCount = pinnedIds.length;

  return (
    <div className="relative z-[1] border-t border-white/40 bg-gradient-to-t from-[rgba(247,243,236,0.95)] to-transparent px-4 py-4 sm:px-6">
      {error ? (
        <div
          role="alert"
          className="mx-auto mb-3 flex max-w-3xl items-start justify-between gap-3 rounded-[14px] border border-[rgba(239,71,112,0.25)] bg-[rgba(239,71,112,0.08)] px-3 py-2 text-sm text-[#C2410C]"
        >
          <p className="min-w-0 flex-1 leading-5">{error}</p>
          {onClearError ? (
            <button
              type="button"
              onClick={onClearError}
              className="shrink-0 text-xs text-[#C2410C] underline-offset-2 hover:underline"
            >
              关闭
            </button>
          ) : null}
        </div>
      ) : null}

      <form
        className="studio-glass relative mx-auto flex max-w-3xl flex-col gap-2 rounded-[22px] p-2.5"
        onSubmit={onSubmit}
      >
        <div className="flex flex-wrap items-center gap-2 px-2 pt-1">
          <label htmlFor={modelId} className="sr-only">
            模型
          </label>
          {customMode && allowCustomModel ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
              <input
                id={modelId}
                type="text"
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                placeholder="输入模型名称"
                disabled={disabled || streaming}
                className="min-w-0 flex-1 rounded-[10px] border border-white/70 bg-white/70 px-2.5 py-1 font-mono text-xs text-[#241E36] outline-none focus:ring-2 focus:ring-[rgba(194,65,12,0.25)] sm:w-48"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomMode(false);
                  if (!modelOptions.includes(model) && modelOptions[0]) {
                    onModelChange(modelOptions[0]);
                  }
                }}
                className="text-xs text-[#8A8298] hover:text-[#241E36]"
              >
                列表
              </button>
            </div>
          ) : (
            <div className="relative">
              <select
                id={modelId}
                value={modelOptions.includes(model) ? model : modelOptions[0] ?? model}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setCustomMode(true);
                    return;
                  }
                  onModelChange(e.target.value);
                }}
                disabled={disabled || streaming || modelsLoading}
                className="appearance-none rounded-[10px] border border-white/70 bg-white/70 py-1 pl-2.5 pr-7 font-mono text-xs text-[#241E36] outline-none focus:ring-2 focus:ring-[rgba(194,65,12,0.25)] disabled:opacity-60"
              >
                {modelOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {allowCustomModel ? (
                  <option value="__custom__">自定义…</option>
                ) : null}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8A8298]" />
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (menuOpen && !slashRange) {
                closeMenu();
                return;
              }
              openSkillMenu("", null);
            }}
            disabled={disabled || streaming || skillsLoading}
            title="选择 Skills（或输入 /）"
            className="inline-flex items-center gap-1 rounded-[10px] border border-white/70 bg-white/70 px-2 py-1 text-xs text-[#615A73] transition hover:border-[rgba(194,65,12,0.25)] hover:bg-[rgba(194,65,12,0.08)] hover:text-[#C2410C] disabled:opacity-50"
          >
            <Wrench className="h-3.5 w-3.5" />
            Skills
            {turnCount + pinCount > 0 ? (
              <span className="rounded-full bg-[rgba(194,65,12,0.12)] px-1.5 text-[10px] font-medium text-[#C2410C]">
                {turnCount + pinCount}
              </span>
            ) : null}
          </button>

          <span className="text-[11px] text-[#8A8298]">
            {streaming
              ? "生成中…"
              : "Enter 发送 · / 选 Skill · Shift+Enter 换行"}
          </span>
        </div>

        <SkillChips
          turnIds={selectedIds}
          pinnedIds={pinnedIds}
          skillsById={skillsById}
          onRemoveTurn={removeSkill}
          onTogglePin={togglePin}
          onClearTurn={clearTurnSkills}
          disabled={disabled || streaming}
        />

        <div className="relative flex items-end gap-2">
          <label className="sr-only" htmlFor={promptId}>
            输入你的需求
          </label>
          <textarea
            ref={textareaRef}
            id={promptId}
            rows={2}
            value={draft}
            onChange={(e) => {
              const next = e.target.value;
              setDraft(next);
              onTextareaInput();
              const cursor = e.target.selectionStart ?? next.length;
              detectSlash(next, cursor);
            }}
            onKeyDown={onKeyDown}
            onClick={(e) => {
              const el = e.currentTarget;
              detectSlash(el.value, el.selectionStart ?? el.value.length);
            }}
            placeholder={placeholder}
            disabled={disabled}
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-6 text-[#241E36] outline-none placeholder:text-[#8A8298] disabled:opacity-60"
            aria-controls={menuOpen ? menuId : undefined}
            aria-expanded={menuOpen}
            aria-autocomplete="list"
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => onStop?.()}
              title="停止生成"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-white/80 bg-white/80 text-[#615A73] transition hover:bg-white"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span className="sr-only">停止</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              title="发送"
              className="studio-send-btn flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-white transition disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" />
              <span className="sr-only">发送</span>
            </button>
          )}

          <SkillSlashMenu
            open={menuOpen}
            query={menuQuery}
            skills={allSkills}
            departments={departments}
            selectedIds={selectedIds}
            loading={skillsLoading}
            highlightIndex={menuIndex}
            onHighlightIndexChange={setMenuIndex}
            view={menuView}
            onViewChange={setMenuView}
            onPickSkill={pickSkillFromMenu}
            onClearTurnSkills={clearTurnSkills}
            menuId={menuId}
            menuRef={menuRef}
          />
        </div>
      </form>
    </div>
  );
}
