"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Download, ImagePlus, LoaderCircle, RefreshCw, Upload } from "lucide-react";
import { useModals } from "@/components/providers";
import type { Artifact } from "@/lib/agent/types";
import {
  MAX_IMAGE_BYTES,
  formatFileSize,
  readFileAsDataUrl,
} from "@/lib/studio/composer-attachments";
import {
  StudioApiError,
  listArtifacts,
  withUserHeaders,
} from "@/lib/studio/api";
import {
  isStudioToolImageMimeType,
  type StudioTool,
} from "@/lib/studio/tool-catalog";

async function parseResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { error?: unknown } & T;
  if (!response.ok) {
    throw new StudioApiError(
      typeof body.error === "string" && body.error ? body.error : fallback,
      response.status,
    );
  }
  return body;
}

function ArtifactImage({
  artifact,
  label,
  className = "h-full w-full object-cover",
}: {
  artifact: Artifact;
  label: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- user-scoped Artifact bytes require cookie auth.
    <img
      src={`/api/artifacts/${encodeURIComponent(artifact.id)}/raw`}
      alt={label}
      className={className}
    />
  );
}

export default function ToolRunForm({ tool }: { tool: StudioTool }) {
  const { account, accountLoading, openLogin } = useModals();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(true);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [result, setResult] = useState<Artifact | null>(null);

  const toolImageArtifacts = useMemo(
    () =>
      artifacts.filter(
        (artifact) =>
          artifact.kind === "image" &&
          artifact.status !== "failed" &&
          isStudioToolImageMimeType(artifact.mimeType),
      ),
    [artifacts],
  );
  const selected = useMemo(
    () => toolImageArtifacts.find((artifact) => artifact.id === selectedId) ?? null,
    [toolImageArtifacts, selectedId],
  );

  const loadArtifacts = useCallback(async () => {
    if (!account) {
      setArtifacts([]);
      setArtifactsLoading(false);
      return;
    }
    setArtifactsLoading(true);
    setArtifactsError(null);
    try {
      setArtifacts(await listArtifacts());
    } catch (error) {
      setArtifactsError(error instanceof Error ? error.message : "加载作品失败");
    } finally {
      setArtifactsLoading(false);
    }
  }, [account]);

  useEffect(() => {
    if (accountLoading) return;
    const timer = window.setTimeout(() => {
      void loadArtifacts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [accountLoading, loadArtifacts]);

  const uploadImage = useCallback(
    async (file: File | null) => {
      if (!file || uploading) return;
      setRunError(null);
      if (!isStudioToolImageMimeType(file.type)) {
        setRunError("请选择 PNG、JPG 或 WebP 图片");
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setRunError(`图片过大，最大支持 ${formatFileSize(MAX_IMAGE_BYTES)}`);
        return;
      }
      setUploading(true);
      try {
        const response = await fetch(`/api/tools/${encodeURIComponent(tool.id)}/upload`, {
          method: "POST",
          headers: withUserHeaders(),
          credentials: "same-origin",
          body: JSON.stringify({
            name: file.name || "商品图片.png",
            dataUrl: await readFileAsDataUrl(file),
          }),
        });
        const { artifact } = await parseResponse<{ artifact: Artifact }>(response, "图片上传失败");
        setArtifacts((current) => [artifact, ...current.filter((item) => item.id !== artifact.id)]);
        setSelectedId(artifact.id);
        setResult(null);
      } catch (error) {
        if (error instanceof StudioApiError && error.status === 401) openLogin("login");
        setRunError(error instanceof Error ? error.message : "图片上传失败");
      } finally {
        setUploading(false);
      }
    },
    [openLogin, tool.id, uploading],
  );

  const run = useCallback(async () => {
    if (running) return;
    if (!account) {
      openLogin("login");
      return;
    }
    if (!selected) {
      setRunError("请先选择一张商品图片");
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const response = await fetch(`/api/tools/${encodeURIComponent(tool.id)}/run`, {
        method: "POST",
        headers: withUserHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ sourceArtifactId: selected.id }),
      });
      const { artifact } = await parseResponse<{ artifact: Artifact }>(response, "商品抠图失败");
      setResult(artifact);
      setArtifacts((current) => [artifact, ...current.filter((item) => item.id !== artifact.id)]);
    } catch (error) {
      if (error instanceof StudioApiError && error.status === 401) openLogin("login");
      setRunError(error instanceof Error ? error.message : "商品抠图失败");
    } finally {
      setRunning(false);
    }
  }, [account, openLogin, running, selected, tool.id]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-canvas/35">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
        className="flex min-h-0 w-80 shrink-0 flex-col border-r border-line bg-surface"
      >
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">商品图片</h2>
              <p className="mt-1 text-xs text-ink-500">{tool.inputHint}</p>
            </div>
            <label className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium text-ink-700 transition hover:bg-canvas">
              {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "上传中" : "上传"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading || !account}
                onChange={(event) => {
                  void uploadImage(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!accountLoading && !account ? (
            <div className="border-l-2 border-primary-400 bg-primary-50/60 px-3 py-3 text-sm leading-6 text-ink-700">
              <p>登录后可上传图片或使用已有作品。</p>
              <button type="button" onClick={() => openLogin("login")} className="mt-1 font-medium text-primary-700 underline underline-offset-2">
                去登录
              </button>
            </div>
          ) : artifactsLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-ink-500">
              <LoaderCircle className="h-4 w-4 animate-spin" /> 正在加载图片
            </div>
          ) : artifactsError ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-rose-700">
              <span>{artifactsError}</span>
              <button type="button" onClick={() => void loadArtifacts()} className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
                <RefreshCw className="h-3.5 w-3.5" /> 重试
              </button>
            </div>
          ) : toolImageArtifacts.length === 0 ? (
            <label className="flex min-h-48 cursor-pointer flex-col items-center justify-center border border-dashed border-line bg-canvas/50 px-5 text-center text-sm text-ink-500 transition hover:border-primary-300 hover:bg-primary-50/40">
              <ImagePlus className="h-6 w-6 text-ink-400" />
              <span className="mt-3">上传第一张商品图片</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={uploading || !account}
                onChange={(event) => {
                  void uploadImage(event.target.files?.[0] ?? null);
                  event.currentTarget.value = "";
                }}
                className="sr-only"
              />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {toolImageArtifacts.map((artifact) => {
                const active = selectedId === artifact.id;
                return (
                  <button
                    key={artifact.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(artifact.id);
                      setResult(null);
                      setRunError(null);
                    }}
                    aria-pressed={active}
                    className={`group relative aspect-square overflow-hidden rounded-lg border text-left transition ${
                      active
                        ? "border-primary-500 ring-2 ring-primary-500/20"
                        : "border-line hover:border-primary-300"
                    }`}
                  >
                    <ArtifactImage artifact={artifact} label={artifact.name} />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1.5 text-xs text-white">
                      {artifact.name}
                    </span>
                    {active ? (
                      <span className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary-500 text-white">
                        <Check className="h-4 w-4" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-line bg-surface p-4">
          {runError ? <p role="alert" className="mb-3 border-l-2 border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-700">{runError}</p> : null}
          <button
            type="submit"
            disabled={running || uploading || !selected || !account}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {running ? "正在抠图" : "开始抠图"}
          </button>
        </div>
      </form>

      <main className="flex min-w-0 flex-1 items-center justify-center overflow-y-auto p-8">
        {result ? (
          <div className="w-full max-w-[560px]">
            <p className="mb-3 text-center text-sm font-medium text-ink-700">透明背景</p>
            <div className="aspect-square overflow-hidden rounded-lg border border-line bg-[repeating-conic-gradient(#f1f3f5_0%_25%,#fff_0%_50%)] bg-[size:20px_20px] shadow-sm">
              <ArtifactImage artifact={result} label={`抠图结果：${result.name}`} className="h-full w-full object-contain" />
            </div>
          </div>
        ) : selected ? (
          <div className="w-full max-w-[560px]">
            <p className="mb-3 text-center text-sm font-medium text-ink-700">原图预览</p>
            <div className="aspect-square overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
              <ArtifactImage artifact={selected} label={`原图：${selected.name}`} className="h-full w-full object-contain" />
            </div>
          </div>
        ) : (
          <div className="max-w-sm text-center">
            <ImagePlus className="mx-auto h-9 w-9 text-ink-300" />
            <p className="mt-4 text-base font-semibold text-ink-700">选择商品图片</p>
            <p className="mt-2 text-sm leading-6 text-ink-500">处理结果会显示在这里。</p>
          </div>
        )}
      </main>

      <aside className="flex min-h-0 w-72 shrink-0 flex-col border-l border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink-900">处理结果</h2>
          <span className="text-xs text-ink-500">{result ? 1 : 0}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {result ? (
            <div className="border border-line bg-canvas/40 p-3">
              <div className="aspect-square overflow-hidden rounded-md bg-[repeating-conic-gradient(#f1f3f5_0%_25%,#fff_0%_50%)] bg-[size:16px_16px]">
                <ArtifactImage artifact={result} label={`抠图结果：${result.name}`} className="h-full w-full object-contain" />
              </div>
              <p className="mt-3 truncate text-sm font-medium text-ink-900" title={result.name}>{result.name}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <a
                  href={`/api/artifacts/${encodeURIComponent(result.id)}/raw`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800"
                >
                  <Download className="h-4 w-4" /> 下载
                </a>
                <Link href="/studio/artifacts" className="text-sm font-medium text-primary-700 hover:text-primary-800">
                  我的作品
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center text-sm text-ink-500">
              <ImagePlus className="h-7 w-7 text-ink-300" />
              <p className="mt-3">暂无结果</p>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
