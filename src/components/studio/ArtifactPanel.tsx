"use client";

import {
  FileCode2,
  FileJson,
  FileText,
  FolderKanban,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import type { Artifact, ArtifactKind } from "@/lib/agent/types";

const KIND_LABELS: Record<ArtifactKind, string> = {
  markdown: "Markdown",
  html: "HTML",
  text: "文本",
  json: "JSON",
  image: "图片",
  binary: "二进制",
};

function KindIcon({ kind }: { kind: ArtifactKind }) {
  const cls = "h-3.5 w-3.5 shrink-0 text-primary-500";
  if (kind === "json") return <FileJson className={cls} />;
  if (kind === "html") return <FileCode2 className={cls} />;
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
  className?: string;
};

export default function ArtifactPanel({
  artifacts,
  selectedId,
  onSelect,
  loading = false,
  error = null,
  onRefresh,
  className = "",
}: ArtifactPanelProps) {
  return (
    <aside
      className={`flex min-h-0 flex-col border-l border-line bg-surface ${className}`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold text-ink-800">
          <FolderKanban className="h-3.5 w-3.5 text-primary-500" />
          本会话作品
        </h2>
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-500 transition hover:bg-canvas hover:text-ink-800 disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="sr-only">刷新</span>
          </button>
        ) : null}
      </div>

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
        ) : (
          <ul className="flex flex-col p-2">
            {artifacts.map((a) => {
              const active = selectedId === a.id;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(a.id)}
                    className={`flex w-full items-start gap-2 rounded-xl px-2.5 py-2.5 text-left transition ${
                      active
                        ? "bg-primary-50 ring-1 ring-primary-200"
                        : "hover:bg-canvas"
                    }`}
                  >
                    <KindIcon kind={a.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-ink-900">
                        {a.name}
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
