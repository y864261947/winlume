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
import { ArrowUp, ChevronDown, Square, Wrench, X } from "lucide-react";
import { fetchPlaza } from "@/lib/catalog";
import type { SkillMeta } from "@/lib/agent/types";

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
  /** Initial / controlled skill ids selected for the next message */
  skillIds?: string[];
  onSkillIdsChange?: (ids: string[]) => void;
};

function filterSkills(skills: SkillMeta[], query: string): SkillMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((s) => {
    const hay = [s.id, s.name, s.description, s.category, ...(s.triggers ?? [])]
      .join("\n")
      .toLowerCase();
    return hay.includes(q);
  });
}

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
}: ComposerProps) {
  const promptId = useId();
  const modelId = useId();
  const menuId = useId();
  const [uncontrolled, setUncontrolled] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([...FALLBACK_MODELS]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [customMode, setCustomMode] = useState(false);
  const [allSkills, setAllSkills] = useState<SkillMeta[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [internalSkillIds, setInternalSkillIds] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const [menuIndex, setMenuIndex] = useState(0);
  const [slashRange, setSlashRange] = useState<{ start: number; end: number } | null>(
    null,
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isControlled = controlledValue !== undefined;
  const draft = isControlled ? controlledValue : uncontrolled;

  const skillIdsControlled = skillIdsProp !== undefined;
  const selectedIds = skillIdsControlled ? skillIdsProp : internalSkillIds;

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
        return res.json() as Promise<{ skills: SkillMeta[] }>;
      })
      .then((data) => {
        if (!cancelled) setAllSkills(data.skills ?? []);
      })
      .catch(() => {
        if (!cancelled) setAllSkills([]);
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

  const selectedSkills = useMemo(() => {
    const map = new Map(allSkills.map((s) => [s.id, s]));
    return selectedIds
      .map((id) => map.get(id) ?? ({ id, name: id, description: "", category: "", source: "bundled" as const, enabled: true }))
      .filter(Boolean);
  }, [allSkills, selectedIds]);

  const menuSkills = useMemo(
    () => filterSkills(allSkills, menuQuery).slice(0, 12),
    [allSkills, menuQuery],
  );

  useEffect(() => {
    setMenuIndex(0);
  }, [menuQuery, menuOpen]);

  // Close slash menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (textareaRef.current?.contains(t)) return;
      setMenuOpen(false);
      setSlashRange(null);
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

  const pickSkillFromMenu = useCallback(
    (skill: SkillMeta) => {
      setSelectedIds((prev) =>
        prev.includes(skill.id) ? prev : [...prev, skill.id],
      );
      // Remove trailing /query token from draft when opened via slash
      if (slashRange && textareaRef.current) {
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
      setMenuOpen(false);
      setMenuQuery("");
      setSlashRange(null);
    },
    [draft, setDraft, setSelectedIds, slashRange],
  );

  const openSkillMenu = useCallback((query = "", range: { start: number; end: number } | null = null) => {
    setMenuQuery(query);
    setSlashRange(range);
    setMenuOpen(true);
  }, []);

  const detectSlash = useCallback(
    (text: string, cursor: number) => {
      // Match `/query` token immediately before cursor (start of string or after whitespace)
      const upto = text.slice(0, cursor);
      const match = upto.match(/(?:^|[\s\n])\/([^\s/]*)$/);
      if (!match) {
        setMenuOpen(false);
        setSlashRange(null);
        setMenuQuery("");
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
    setMenuOpen(false);
    setSlashRange(null);
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
  ]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (menuOpen && menuSkills[menuIndex]) {
      pickSkillFromMenu(menuSkills[menuIndex]);
      return;
    }
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen && menuSkills.length) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMenuIndex((i) => (i + 1) % menuSkills.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMenuIndex((i) => (i - 1 + menuSkills.length) % menuSkills.length);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const skill = menuSkills[menuIndex];
        if (skill) pickSkillFromMenu(skill);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        setSlashRange(null);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const skill = menuSkills[menuIndex];
        if (skill) pickSkillFromMenu(skill);
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

  return (
    <div className="border-t border-line bg-surface px-4 py-4 sm:px-6">
      {error ? (
        <div
          role="alert"
          className="mx-auto mb-3 flex max-w-3xl items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          <p className="min-w-0 flex-1 leading-5">{error}</p>
          {onClearError ? (
            <button
              type="button"
              onClick={onClearError}
              className="shrink-0 text-xs text-rose-600 underline-offset-2 hover:underline"
            >
              关闭
            </button>
          ) : null}
        </div>
      ) : null}

      <form
        className="relative mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border border-line bg-canvas p-2 shadow-sm"
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
                className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1 font-mono text-xs text-ink-800 outline-none focus:border-primary-300 sm:w-48"
              />
              <button
                type="button"
                onClick={() => {
                  setCustomMode(false);
                  if (!modelOptions.includes(model) && modelOptions[0]) {
                    onModelChange(modelOptions[0]);
                  }
                }}
                className="text-xs text-ink-500 hover:text-ink-800"
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
                className="appearance-none rounded-lg border border-line bg-surface py-1 pl-2.5 pr-7 font-mono text-xs text-ink-800 outline-none focus:border-primary-300 disabled:opacity-60"
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
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              if (menuOpen && !slashRange) {
                setMenuOpen(false);
                return;
              }
              openSkillMenu("", null);
            }}
            disabled={disabled || streaming || skillsLoading}
            title="选择 Skills（或输入 /）"
            className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-ink-600 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 disabled:opacity-50"
          >
            <Wrench className="h-3.5 w-3.5" />
            Skills
            {selectedIds.length > 0 ? (
              <span className="rounded-full bg-primary-100 px-1.5 text-[10px] font-medium text-primary-700">
                {selectedIds.length}
              </span>
            ) : null}
          </button>

          <span className="text-[11px] text-ink-400">
            {streaming
              ? "生成中…"
              : "Enter 发送 · / 选 Skill · Shift+Enter 换行"}
          </span>
        </div>

        {selectedSkills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-2">
            {selectedSkills.map((s) => (
              <span
                key={s.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary-200 bg-primary-50 py-0.5 pl-2.5 pr-1 text-xs text-primary-800"
              >
                <span className="truncate">{s.name || s.id}</span>
                <button
                  type="button"
                  onClick={() => removeSkill(s.id)}
                  disabled={disabled || streaming}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary-600 hover:bg-primary-100 disabled:opacity-50"
                  title="移除"
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">移除 {s.name || s.id}</span>
                </button>
              </span>
            ))}
          </div>
        ) : null}

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
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-6 text-ink-900 outline-none placeholder:text-ink-400 disabled:opacity-60"
            aria-controls={menuOpen ? menuId : undefined}
            aria-expanded={menuOpen}
            aria-autocomplete="list"
          />
          {streaming ? (
            <button
              type="button"
              onClick={() => onStop?.()}
              title="停止生成"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink-700 transition hover:bg-canvas"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span className="sr-only">停止</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              title="发送"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" />
              <span className="sr-only">发送</span>
            </button>
          )}

          {menuOpen ? (
            <div
              ref={menuRef}
              id={menuId}
              role="listbox"
              aria-label="选择 Skill"
              className="absolute bottom-full left-0 z-20 mb-2 max-h-64 w-full max-w-md overflow-auto rounded-xl border border-line bg-surface py-1 shadow-lg"
            >
              <div className="border-b border-line px-3 py-1.5 text-[11px] text-ink-400">
                {skillsLoading
                  ? "加载 Skills…"
                  : menuQuery
                    ? `筛选「${menuQuery}」· ↑↓ 选择 · Enter 确认`
                    : "输入 / 搜索 · 点击添加本条消息的 Skills"}
              </div>
              {menuSkills.length === 0 ? (
                <p className="px-3 py-3 text-sm text-ink-500">
                  {skillsLoading ? "加载中…" : "没有匹配的 Skill"}
                </p>
              ) : (
                menuSkills.map((skill, i) => {
                  const active = i === menuIndex;
                  const selected = selectedIds.includes(skill.id);
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setMenuIndex(i)}
                      onClick={() => {
                        if (slashRange) {
                          pickSkillFromMenu(skill);
                        } else {
                          toggleSkill(skill.id);
                        }
                      }}
                      className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition ${
                        active ? "bg-primary-50" : "hover:bg-canvas"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-ink-900">
                        <span className="truncate">{skill.name}</span>
                        {selected ? (
                          <span className="shrink-0 rounded bg-primary-100 px-1.5 text-[10px] text-primary-700">
                            已选
                          </span>
                        ) : null}
                      </span>
                      <span className="line-clamp-1 text-xs text-ink-500">
                        {skill.description || skill.id}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      </form>
    </div>
  );
}
