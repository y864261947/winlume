"use client";

import { useMemo, useState } from "react";
import {
  CheckSquare,
  ChevronLeft,
  Download,
  FileCode2,
  FileJson,
  FileText,
  FolderKanban,
  Image as ImageIcon,
  LoaderCircle,
  PanelsTopLeft,
  RefreshCw,
  Square,
} from "lucide-react";
import type { Artifact, ArtifactKind } from "@/lib/agent/types";
import { downloadImageArtifact } from "@/lib/studio/artifact-download";

const KIND_LABELS: Record<ArtifactKind, string> = {
  markdown: "Markdown",
  html: "HTML",
  text: "文本",
  json: "JSON",
  image: "图片",
  binary: "二进制",
  canvas: "画布",
};

const FILTERS: { key: "all" | ArtifactKind; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "markdown", label: "MD" },
  { key: "html", label: "HTML" },
  { key: "json", label: "JSON" },
  { key: "text", label: "文本" },
  { key: "image", label: "图" },
  { key: "canvas", label: "画布" },
];

function KindIcon({ kind }: { kind: ArtifactKind }) {
  const cls = "h-3.5 w-3.5 shrink-0 text-primary-500";
  if (kind === "json") return <FileJson className={cls} />;
  if (kind === "html") return <FileCode2 className={cls} />;
  if (kind === "image") return <ImageIcon className={cls} />;
  if (kind === "canvas") return <PanelsTopLeft className={cls} />;
  return <FileText className={cls} />;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export type ArtifactPanelProps = {
  artifacts: Artifact[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  /** Collapse list to strip — lives in header toolbar so it never covers refresh. */
  onCollapse?: () => void;
  /** Highlight this id briefly when a new artifact lands (NewMax “attention”). */
  flashId?: string | null;
  className?: string;
};

export default function ArtifactPanel({
  artifacts,
  selectedId,
  onSelect,
  loading = false,
  error = null,
  onRefresh,
  onCollapse,
  flashId = null,
  className = "",
}: ArtifactPanelProps) {
  const [kindFilter, setKindFilter] = useState<"all" | ArtifactKind>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const imageArtifacts = useMemo(
    () =>
      artifacts.filter(
        (artifact) => artifact.kind === "image" && artifact.status !== "failed",
      ),
    [artifacts],
  );

  const toggleSelectMode = () => {
    setSelectMode((previous) => !previous);
    setSelectedIds(new Set());
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadSelected = () => {
    imageArtifacts
      .filter((artifact) => selectedIds.has(artifact.id))
      .forEach((artifact, index) => {
        window.setTimeout(() => downloadImageArtifact(artifact), index * 150);
      });
  };

  const kindCounts = useMemo(() => {
    const map = new Map<ArtifactKind, number>();
    for (const a of artifacts) {
      map.set(a.kind, (map.get(a.kind) ?? 0) + 1);
    }
    return map;
  }, [artifacts]);

  const visibleFilters = useMemo(() => {
    return FILTERS.filter((f) => {
      if (f.key === "all") return true;
      return (kindCounts.get(f.key) ?? 0) > 0;
    });
  }, [kindCounts]);

  const filtered = useMemo(() => {
    if (kindFilter === "all") return artifacts;
    return artifacts.filter((a) => a.kind === kindFilter);
  }, [artifacts, kindFilter]);

  // If active filter has no items after refresh, fall back to all
  const list =
    filtered.length === 0 && kindFilter !== "all" ? artifacts : filtered;
  const activeFilter =
    filtered.length === 0 && kindFilter !== "all" ? "all" : kindFilter;

  return (
    <aside
      className={`flex min-h-0 flex-col border-l border-line bg-surface ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <h2 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-800">
          <FolderKanban className="h-3.5 w-3.5 shrink-0 text-primary-500" />
          <span className="truncate">本会话作品</span>
          {artifacts.length > 0 ? (
            <span className="rounded-full bg-[rgba(15, 23, 42,0.1)] px-1.5 text-[10px] font-medium tabular-nums text-[#0F172A]">
              {artifacts.length}
            </span>
          ) : null}
        </h2>
        <div className="flex shrink-0 items-center gap-0.5">
          {imageArtifacts.length > 1 ? (
            <button
              type="button"
              onClick={toggleSelectMode}
              className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition ${
                selectMode
                  ? "bg-[rgba(15,23,42,0.1)] text-[#0F172A]"
                  : "text-ink-500 hover:bg-canvas hover:text-ink-800"
              }`}
              title="多选图片以批量下载"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {selectMode ? "取消多选" : "多选"}
            </button>
          ) : null}
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-500 transition hover:bg-canvas hover:text-ink-800 disabled:opacity-50"
              title="刷新"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              <span className="sr-only">刷新</span>
            </button>
          ) : null}
          {onCollapse ? (
            <button
              type="button"
              onClick={onCollapse}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-500 transition hover:bg-canvas hover:text-ink-800"
              title="收起列表，专注预览"
              aria-label="收起作品列表"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {selectMode && selectedIds.size > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line/70 bg-[rgba(15,23,42,0.03)] px-3 py-1.5 text-xs text-ink-700">
          <span>已选 {selectedIds.size} 张</span>
          <button
            type="button"
            onClick={downloadSelected}
            className="inline-flex items-center gap-1 rounded-md bg-[#0F172A] px-2 py-1 text-[11px] font-medium text-white transition hover:bg-[#1E293B]"
          >
            <Download className="h-3 w-3" />
            批量下载
          </button>
        </div>
      ) : null}

      {/* Kind chips — only show when multiple kinds exist */}
      {artifacts.length > 1 && visibleFilters.length > 2 ? (
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-line/70 px-2 py-1.5">
          {visibleFilters.map((f) => {
            const count =
              f.key === "all" ? artifacts.length : (kindCounts.get(f.key) ?? 0);
            const active = activeFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setKindFilter(f.key)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                  active
                    ? "bg-[rgba(15, 23, 42,0.12)] text-[#0F172A]"
                    : "text-[#8A8298] hover:bg-white/60 hover:text-[#241E36]"
                }`}
              >
                {f.label}
                <span className="ml-0.5 tabular-nums opacity-70">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && artifacts.length === 0 ? (
          <div className="flex items-center gap-2 px-3 py-6 text-xs text-ink-500">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            加载中…
          </div>
        ) : error ? (
          <div className="px-3 py-4 text-xs text-rose-600">
            <p>{error}</p>
            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                className="mt-2 text-primary-600 underline"
              >
                重试
              </button>
            ) : null}
          </div>
        ) : artifacts.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <FolderKanban className="mx-auto h-6 w-6 text-ink-300" />
            <p className="mt-2 text-xs text-ink-500">暂无作品</p>
            <p className="mt-1 text-[11px] leading-4 text-ink-400">
              让助手「保存为作品」后会出现在这里
            </p>
          </div>
        ) : list.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-ink-400">
            该类型暂无作品
          </p>
        ) : (
          <ul className="flex flex-col p-2">
            {list.map((a) => {
              const active = selectedId === a.id;
              const flash = flashId === a.id;
              const checked = selectedIds.has(a.id);
              const selectable =
                selectMode && a.kind === "image" && a.status !== "failed";
              return (
                <li key={a.id} className="flex items-center gap-1.5">
                  {selectMode ? (
                    <button
                      type="button"
                      onClick={() => selectable && toggleSelected(a.id)}
                      disabled={!selectable}
                      className="shrink-0 p-1 text-ink-400 disabled:opacity-30"
                      title={selectable ? "选择此作品" : "仅支持选择图片作品"}
                    >
                      {checked ? (
                        <CheckSquare className="h-4 w-4 text-primary-600" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() =>
                      selectMode
                        ? selectable && toggleSelected(a.id)
                        : onSelect(a.id)
                    }
                    className={`flex w-full items-start gap-2 rounded-xl px-2.5 py-2.5 text-left transition ${
                      active && !selectMode
                        ? "bg-primary-50 ring-1 ring-primary-200"
                        : "hover:bg-canvas"
                    } ${
                      flash
                        ? "animate-pulse ring-2 ring-[rgba(51, 65, 85,0.55)]"
                        : ""
                    }`}
                  >
                    <KindIcon kind={a.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink-900">
                        {a.name}
                        {flash ? (
                          <span className="ml-1.5 inline-block rounded bg-[rgba(51, 65, 85,0.2)] px-1 text-[9px] font-semibold uppercase tracking-wide text-[#0F172A]">
                            NEW
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[10px] text-ink-400">
                        {KIND_LABELS[a.kind] ?? a.kind} · {formatTime(a.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
