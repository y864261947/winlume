"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { highlightCode } from "@/lib/docs/highlight";

const LANG_KEY = "reizo-docs-lang";

function useCopy(code: string) {
  const [copied, setCopied] = useState(false);
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }
  return { copied, onCopy };
}

export function CodeBlock({
  code,
  language = "text",
  title,
}: {
  code: string;
  language?: string;
  title?: string;
}) {
  const html = useMemo(() => highlightCode(code, language), [code, language]);
  const { copied, onCopy } = useCopy(code);

  return (
    <div className="docs-code">
      <div className="docs-code-bar">
        <span className="docs-code-lang">{title ?? language}</span>
        <button type="button" onClick={onCopy} aria-label="复制代码">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <div className="docs-code-body">
        <pre>
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
    </div>
  );
}

export function CodeTabs({
  samples,
}: {
  samples: { id: string; label: string; language: string; code: string }[];
}) {
  const [active, setActive] = useState(samples[0]?.id ?? "curl");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LANG_KEY);
      if (saved && samples.some((s) => s.id === saved)) setActive(saved);
    } catch {
      /* ignore */
    }
  }, [samples]);

  const current = samples.find((s) => s.id === active) ?? samples[0];
  const html = useMemo(
    () => (current ? highlightCode(current.code, current.language) : ""),
    [current],
  );
  const { copied, onCopy } = useCopy(current?.code ?? "");

  if (!current) return null;

  function select(id: string) {
    setActive(id);
    try {
      window.localStorage.setItem(LANG_KEY, id);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="docs-code docs-code-panel">
      <div className="docs-code-bar docs-code-tabs-bar" role="tablist" aria-label="代码语言">
        <div className="docs-code-tabs">
          {samples.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === active}
              className={s.id === active ? "is-active" : undefined}
              onClick={() => select(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={onCopy} aria-label="复制代码">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <div className="docs-code-body">
        <pre>
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
      </div>
    </div>
  );
}
