"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, ChevronDown, Square } from "lucide-react";
import { fetchPlaza } from "@/lib/catalog";

const FALLBACK_MODELS = [
  "gpt-4o-mini",
  "gpt-4o",
  "claude-3-5-sonnet",
  "deepseek-chat",
] as const;

const PLAZA_LIMIT = 30;

export type ComposerProps = {
  value?: string;
  onChange?: (value: string) => void;
  onSend: (text: string) => void | Promise<void>;
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
}: ComposerProps) {
  const promptId = useId();
  const modelId = useId();
  const [uncontrolled, setUncontrolled] = useState("");
  const [modelOptions, setModelOptions] = useState<string[]>([...FALLBACK_MODELS]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [customMode, setCustomMode] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isControlled = controlledValue !== undefined;
  const draft = isControlled ? controlledValue : uncontrolled;

  const setDraft = useCallback(
    (next: string) => {
      if (isControlled) onChange?.(next);
      else setUncontrolled(next);
    },
    [isControlled, onChange],
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
          // If current model not in list, keep it (custom) or pick first
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

  // Ensure selected model is visible in options
  useEffect(() => {
    if (model && !modelOptions.includes(model) && !customMode) {
      setModelOptions((prev) => [model, ...prev.filter((m) => m !== model)]);
    }
  }, [model, modelOptions, customMode]);

  const canSend = Boolean(draft.trim()) && !disabled && !streaming;

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || disabled || streaming) return;
    onClearError?.();
    void onSend(text);
    setDraft("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [draft, disabled, streaming, onSend, onClearError, setDraft]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
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
        className="mx-auto flex max-w-3xl flex-col gap-2 rounded-2xl border border-line bg-canvas p-2 shadow-sm"
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
          <span className="text-[11px] text-ink-400">
            {streaming ? "生成中…" : "Enter 发送 · Shift+Enter 换行"}
          </span>
        </div>

        <div className="flex items-end gap-2">
          <label className="sr-only" htmlFor={promptId}>
            输入你的需求
          </label>
          <textarea
            ref={textareaRef}
            id={promptId}
            rows={2}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              onTextareaInput();
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent px-3 py-2 text-sm leading-6 text-ink-900 outline-none placeholder:text-ink-400 disabled:opacity-60"
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
        </div>
      </form>
    </div>
  );
}
