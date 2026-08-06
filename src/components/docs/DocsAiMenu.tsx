"use client";

import { Check, ChevronDown, Copy, ExternalLink, FileText } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ApiDocPage } from "@/data/docs/api-catalog";
import {
  AI_OPEN_TARGETS,
  buildAiOpenPrompt,
  pageToMarkdown,
} from "@/lib/docs/page-markdown";

type Props = {
  page: ApiDocPage;
  /** Absolute page URL when available (helps AI prompt) */
  pageUrl?: string;
};

/**
 * “复制 Markdown / 在 ChatGPT·Claude·DeepSeek 中打开”
 * Pattern used by Fumadocs page-actions & similar docs products.
 */
export function DocsAiMenu({ page, pageUrl }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const markdown = pageToMarkdown(page, pageUrl);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  function openIn(targetId: string) {
    const target = AI_OPEN_TARGETS.find((t) => t.id === targetId);
    if (!target) return;
    const prompt = buildAiOpenPrompt(markdown, pageUrl);
    // Best-effort: also put full markdown on clipboard so user can paste if URL truncates.
    void navigator.clipboard.writeText(markdown).catch(() => undefined);
    window.open(target.buildUrl(prompt), "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  return (
    <div className="docs-ai-menu" ref={rootRef}>
      <button
        type="button"
        className="docs-ai-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <FileText aria-hidden />
        复制 Markdown
        <ChevronDown aria-hidden className={open ? "is-open" : undefined} />
      </button>

      {open ? (
        <div className="docs-ai-dropdown" id={menuId} role="menu">
          <button
            type="button"
            role="menuitem"
            className="docs-ai-item"
            onClick={() => void copyMarkdown()}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            <span>{copied ? "已复制 Markdown" : "复制 Markdown"}</span>
          </button>

          <div className="docs-ai-sep" role="separator" />

          {AI_OPEN_TARGETS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              className="docs-ai-item"
              onClick={() => openIn(t.id)}
            >
              <ExternalLink aria-hidden />
              <span>{t.label}</span>
            </button>
          ))}

          <p className="docs-ai-hint">
            打开时会附带本页 Markdown；若内容过长可能截断，完整版已尝试写入剪贴板。
          </p>
        </div>
      ) : null}
    </div>
  );
}
