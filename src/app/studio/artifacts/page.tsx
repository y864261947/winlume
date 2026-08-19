"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Clapperboard,
  FileCode2,
  FileJson,
  FileText,
  FolderKanban,
  LoaderCircle,
  PanelsTopLeft,
  RefreshCw,
  Table2,
} from "lucide-react";
import type { Artifact, ArtifactKind } from "@/lib/agent/types";
import { StudioApiError, withUserHeaders } from "@/lib/studio/api";
import { useModals } from "@/components/providers";
import ArtifactPreview from "@/components/studio/ArtifactPreview";

const KIND_LABELS: Record<ArtifactKind, string> = {
  markdown: "Markdown",
  html: "HTML",
  text: "文本",
  json: "JSON",
  image: "图片",
  video: "参考视频",
  "video-analysis": "视频拆解",
  binary: "二进制",
  canvas: "画布",
  sheet: "表格",
};

function KindIcon({ kind }: { kind: ArtifactKind }) {
  const cls = "h-4 w-4 shrink-0 text-primary-500";
  if (kind === "json") return <FileJson className={cls} />;
  if (kind === "html") return <FileCode2 className={cls} />;
  if (kind === "canvas") return <PanelsTopLeft className={cls} />;
  if (kind === "sheet") return <Table2 className={cls} />;
  if (kind === "video" || kind === "video-analysis") {
    return <Clapperboard className={cls} />;
  }
  return <FileText className={cls} />;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function StudioArtifactsPage() {
  const { account, accountLoading, openLogin } = useModals();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/artifacts", {
        headers: withUserHeaders(),
        credentials: "same-origin",
      });
      if (res.status === 401) {
        throw new StudioApiError("请先登录", 401);
      }
      if (!res.ok) {
        throw new Error("加载作品失败");
      }
      const data = (await res.json()) as { artifacts: Artifact[] };
      const list = data.artifacts ?? [];
      setArtifacts(list);
      setSelectedId((prev) => {
        if (prev && list.some((a) => a.id === prev)) return prev;
        return list[0]?.id ?? null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
      setArtifacts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (accountLoading) return;
    if (!account) {
      setLoading(false);
      setError("请先登录后查看作品");
      setArtifacts([]);
      return;
    }
    void load();
  }, [account, accountLoading, load]);

  useEffect(() => {
    if (!selectedId || !account) {
      setContent(null);
      return;
    }
    let cancelled = false;
    setContentLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/artifacts/${encodeURIComponent(selectedId)}`, {
          headers: withUserHeaders(),
          credentials: "same-origin",
        });
        if (!res.ok) throw new Error("读取内容失败");
        const data = (await res.json()) as { content?: string };
        if (!cancelled) setContent(data.content ?? "");
      } catch {
        if (!cancelled) setContent(null);
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, account]);

  const selected = useMemo(
    () => artifacts.find((a) => a.id === selectedId) ?? null,
    [artifacts, selectedId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-line bg-surface px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight text-ink-950">
              <FolderKanban className="h-5 w-5 text-primary-500" />
              作品
            </h1>
            <p className="mt-1 text-sm text-ink-500">
              对话、工具处理、画布与参考视频拆解产生的所有作品。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || !account}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink-700 transition hover:bg-surface disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            刷新
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          {accountLoading || loading ? (
            <div className="flex items-center gap-2 text-sm text-ink-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              正在加载作品…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
              {!account ? (
                <button
                  type="button"
                  onClick={() => openLogin("login")}
                  className="ml-3 underline"
                >
                  去登录
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void load()}
                  className="ml-3 underline"
                >
                  重试
                </button>
              )}
            </div>
          ) : artifacts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-canvas px-6 py-12 text-center">
              <FolderKanban className="mx-auto h-8 w-8 text-ink-300" />
              <p className="mt-3 text-sm text-ink-500">还没有作品</p>
              <p className="mt-1 text-xs text-ink-400">
                在对话中让助手「保存为作品」，例如：写一份一页纸的竞品调研大纲并保存为作品
              </p>
              <Link
                href="/studio"
                className="mt-4 inline-flex rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600"
              >
                去新对话
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {artifacts.map((a) => {
                const active = selectedId === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      active
                        ? "border-primary-300 bg-primary-50 shadow-sm"
                        : "border-line bg-surface hover:border-primary-200 hover:bg-canvas"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <KindIcon kind={a.kind} />
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-sm font-semibold text-ink-900">
                          {a.name}
                        </h2>
                        <p className="mt-1 font-mono text-[10px] text-ink-400">
                          {KIND_LABELS[a.kind] ?? a.kind} · {formatTime(a.createdAt)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-2 truncate font-mono text-[10px] text-ink-400">
                      {a.id}
                    </p>
                    {a.sessionId && !a.sessionId.startsWith("tool:") && (
                      <Link
                        href={`/studio/c/${encodeURIComponent(a.sessionId)}`}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2 inline-block text-[11px] text-primary-600 hover:underline"
                      >
                        打开来源会话
                      </Link>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="hidden min-h-0 w-96 shrink-0 border-l border-line bg-surface lg:flex lg:flex-col">
          <ArtifactPreview
            artifact={selected}
            content={content}
            loading={contentLoading}
            onRefresh={() => {
              void load();
            }}
            className="min-h-0 flex-1"
          />
        </aside>
      </div>
    </div>
  );
}
