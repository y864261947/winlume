"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSearch, Search, TrendingUp } from "lucide-react";
import Modal from "./Modal";
import { products } from "@/data/products";
import { getCategory } from "@/data/taxonomy";

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  return (
    <Modal open={open} onClose={onClose} label="搜索" align="top">
      {/* Modal 关闭时会卸载内部组件，输入状态随之自动重置 */}
      <SearchPanel onClose={onClose} />
    </Modal>
  );
}

function SearchPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.filter((p) => p.isNew).slice(0, 6);
    return products
      .filter((p) => {
        const hay = `${p.name} ${p.brand} ${getCategory(p.category)?.name ?? ""} ${p.tagline}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8);
  }, [query]);

  // 高亮项保持可见
  useEffect(() => {
    document.getElementById(`search-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const go = (id: string) => {
    onClose();
    router.push(`/products/${id}`);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl shadow-ink-950/15">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
        <Search className="h-4 w-4 shrink-0 text-ink-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && results[activeIndex]) {
              go(results[activeIndex].id);
            }
          }}
          role="combobox"
          aria-expanded="true"
          aria-controls="search-results"
          aria-activedescendant={results.length > 0 ? `search-option-${activeIndex}` : undefined}
          aria-label="搜索产品"
          placeholder="搜索模型、API 或应用…"
          className="w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-300"
        />
        <kbd className="shrink-0 rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-ink-400">
          ESC
        </kbd>
      </div>

      <div className="max-h-[45vh] overflow-y-auto p-2" role="listbox" id="search-results" aria-label="搜索结果">
        {!query.trim() && (
          <p className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-xs text-ink-400">
            <TrendingUp className="h-3.5 w-3.5" />
            热门新品
          </p>
        )}
        {results.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-ink-400">
            <FileSearch className="h-8 w-8" />
            <p className="text-sm">没有匹配「{query}」的结果</p>
          </div>
        ) : (
          results.map((p, index) => {
            const cat = getCategory(p.category);
            const active = index === activeIndex;
            return (
              <button
                key={p.id}
                type="button"
                id={`search-option-${index}`}
                role="option"
                aria-selected={active}
                onClick={() => go(p.id)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${active ? "bg-canvas" : ""}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm text-ink-900">{p.name}</p>
                  <p className="truncate text-xs text-ink-500">{p.tagline}</p>
                </div>
                {cat && (
                  <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-500">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    {cat.name}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
