"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { Check, Download, ImagePlus, LoaderCircle, MessageSquare, RefreshCw, Upload } from "lucide-react";
import { useModals } from "@/components/providers";
import type { Artifact } from "@/lib/agent/types";
import { formatFileSize, readFileAsDataUrl } from "@/lib/studio/composer-attachments";
import {
  StudioApiError,
  listArtifacts,
  withUserHeaders,
} from "@/lib/studio/api";
import {
  BACKGROUND_REMOVAL_SAMPLES,
  BACKGROUND_REMOVAL_SUBJECT_OPTIONS,
  DEFAULT_BACKGROUND_REMOVAL_SUBJECT,
  sampleForSubject,
  type BackgroundRemovalSubject,
} from "@/lib/studio/background-removal";
import {
  isStudioToolImageMimeType,
  MAX_STUDIO_TOOL_IMAGE_BYTES,
  type StudioTool,
} from "@/lib/studio/tool-catalog";
import {
  ImageCompareSlider,
  type ComparePreviewBackground,
} from "./ImageCompareSlider";

const RESULT_HISTORY_MAX = 8;

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

function rawArtifactUrl(id: string): string {
  return `/api/artifacts/${encodeURIComponent(id)}/raw`;
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
    <img src={rawArtifactUrl(artifact.id)} alt={label} className={className} />
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
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
  const [results, setResults] = useState<Artifact[]>([]);
  const [subject, setSubject] = useState<BackgroundRemovalSubject>(
    DEFAULT_BACKGROUND_REMOVAL_SUBJECT,
  );
  const [dropActive, setDropActive] = useState(false);
  const [previewBackground, setPreviewBackground] =
    useState<ComparePreviewBackground>("checker");

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
  const result = results[0] ?? null;
  const demo = sampleForSubject(subject);

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
      if (file.size > MAX_STUDIO_TOOL_IMAGE_BYTES) {
        setRunError(`图片过大，最大支持 ${formatFileSize(MAX_STUDIO_TOOL_IMAGE_BYTES)}`);
        return;
      }
      setUploading(true);
      try {
        const response = await fetch(`/api/tools/${encodeURIComponent(tool.id)}/upload`, {
          method: "POST",
          headers: withUserHeaders(),
          credentials: "same-origin",
          body: JSON.stringify({
            name: file.name || "图片.png",
            dataUrl: await readFileAsDataUrl(file),
          }),
        });
        const { artifact } = await parseResponse<{ artifact: Artifact }>(response, "图片上传失败");
        setArtifacts((current) => [artifact, ...current.filter((item) => item.id !== artifact.id)]);
        setSelectedId(artifact.id);
        setResults([]);
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
      setRunError("请先选择一张图片");
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const response = await fetch(`/api/tools/${encodeURIComponent(tool.id)}/run`, {
        method: "POST",
        headers: withUserHeaders(),
        credentials: "same-origin",
        body: JSON.stringify({ sourceArtifactId: selected.id, subject }),
      });
      const { artifact } = await parseResponse<{ artifact: Artifact }>(response, "抠图失败");
      setResults((current) => [artifact, ...current.filter((item) => item.id !== artifact.id)].slice(0, RESULT_HISTORY_MAX));
      setArtifacts((current) => [artifact, ...current.filter((item) => item.id !== artifact.id)]);
    } catch (error) {
      if (error instanceof StudioApiError && error.status === 401) openLogin("login");
      setRunError(error instanceof Error ? error.message : "抠图失败");
    } finally {
      setRunning(false);
    }
  }, [account, openLogin, running, selected, subject, tool.id]);

  const acceptDroppedImage = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      setDropActive(false);
      const file = event.dataTransfer.files?.[0] ?? null;
      if (file) void uploadImage(file);
    },
    [uploadImage],
  );

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const file = event.clipboardData?.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      event.preventDefault();
      void uploadImage(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [uploadImage]);

  const downloadWhiteBackground = useCallback(async (artifact: Artifact) => {
    const image = new Image();
    image.src = rawArtifactUrl(artifact.id);
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = artifact.name.replace(/\.png$/i, "") + "（白底）.png";
    link.click();
    URL.revokeObjectURL(href);
  }, []);

  const continueHref = result
    ? `/studio?artifact=${encodeURIComponent(result.id)}&prompt=${encodeURIComponent("请继续用这张已抠好背景的图。")}`
    : "/studio";

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
              <h2 className="text-sm font-semibold text-ink-900">图片</h2>
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

        <div
          className={`min-h-0 flex-1 overflow-y-auto p-4 ${dropActive ? "bg-primary-50/50" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={acceptDroppedImage}
        >
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
              <span className="mt-3">拖入、粘贴或上传图片</span>
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
                      setResults([]);
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
          <fieldset className="mb-4">
            <legend className="text-xs font-medium text-ink-700">主体类型</legend>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {BACKGROUND_REMOVAL_SUBJECT_OPTIONS.map((option) => {
                const active = subject === option.id;
                return (
                  <label
                    key={option.id}
                    className={`cursor-pointer rounded-lg border px-2.5 py-2 transition ${
                      active
                        ? "border-primary-500 bg-primary-50/70 text-ink-900"
                        : "border-line text-ink-600 hover:border-primary-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="subject"
                      value={option.id}
                      checked={active}
                      onChange={() => {
                        setSubject(option.id);
                        setResults([]);
                      }}
                      className="sr-only"
                    />
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-ink-500">{option.hint}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {runError ? <p role="alert" className="mb-3 border-l-2 border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-700">{runError}</p> : null}
          <button
            type="submit"
            disabled={running || uploading || !selected || !account}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {running ? "正在抠图" : result ? "再跑一次" : "开始抠图"}
          </button>
        </div>
      </form>

      <main
        className={`flex min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto p-8 ${dropActive ? "bg-primary-50/30" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={acceptDroppedImage}
      >
        {result && selected ? (
          <div className="w-full max-w-[640px]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink-700">拖动对比原图和结果</p>
              <div className="flex rounded-lg border border-line p-0.5 text-xs">
                {(["checker", "white", "black"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPreviewBackground(value)}
                    className={`rounded-md px-2 py-1 ${
                      previewBackground === value ? "bg-ink-950 text-white" : "text-ink-600"
                    }`}
                  >
                    {value === "checker" ? "网格" : value === "white" ? "白底" : "黑底"}
                  </button>
                ))}
              </div>
            </div>
            <ImageCompareSlider
              beforeSrc={rawArtifactUrl(selected.id)}
              afterSrc={rawArtifactUrl(result.id)}
              beforeAlt={`原图：${selected.name}`}
              afterAlt={`抠图结果：${result.name}`}
              previewBackground={previewBackground}
            />
          </div>
        ) : selected ? (
          <div className="w-full max-w-[560px]">
            <p className="mb-3 text-center text-sm font-medium text-ink-700">原图预览</p>
            <div className="aspect-square overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
              <ArtifactImage artifact={selected} label={`原图：${selected.name}`} className="h-full w-full object-contain" />
            </div>
          </div>
        ) : (
          <div className="w-full max-w-[640px]">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-ink-700">样例 · {demo.label}</p>
                <p className="mt-1 text-xs text-ink-500">{demo.caption}</p>
              </div>
              <span className="rounded-full bg-ink-950/80 px-2 py-0.5 text-[11px] text-white">
                效果示意
              </span>
            </div>
            <ImageCompareSlider
              beforeSrc={demo.beforeSrc}
              afterSrc={demo.afterSrc}
              beforeAlt={`${demo.label}原图样例`}
              afterAlt={`${demo.label}抠图后样例`}
              previewBackground="checker"
            />
            <div className="mt-4 grid grid-cols-3 gap-2">
              {BACKGROUND_REMOVAL_SAMPLES.map((sample) => {
                const active = demo.subject === sample.subject;
                return (
                  <button
                    key={sample.subject}
                    type="button"
                    onClick={() => {
                      setSubject(sample.subject);
                      setResults([]);
                    }}
                    className={`overflow-hidden rounded-lg border text-left transition ${
                      active
                        ? "border-primary-500 ring-2 ring-primary-500/20"
                        : "border-line hover:border-primary-300"
                    }`}
                  >
                    <span className="relative block aspect-[4/3] bg-canvas">
                      {/* eslint-disable-next-line @next/next/no-img-element -- static public sample */}
                      <img src={sample.beforeSrc} alt="" className="h-full w-full object-cover" />
                      <span className="absolute inset-y-0 right-0 w-1/2 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element -- static public sample */}
                        <img
                          src={sample.afterSrc}
                          alt=""
                          className="absolute inset-y-0 right-0 h-full w-[200%] max-w-none object-cover object-right"
                        />
                      </span>
                    </span>
                    <span className="block px-2 py-1.5 text-xs font-medium text-ink-700">
                      {sample.label}
                    </span>
                  </button>
                );
              })}
            </div>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface px-5 py-4 text-center text-sm text-ink-500 transition hover:border-primary-300 hover:bg-primary-50/30">
              <span className="font-medium text-ink-700">拖入、粘贴或点击上传你的图</span>
              <span className="mt-1 text-xs">会得到和上面一样的透明背景结果</span>
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
        )}
      </main>

      <aside className="flex min-h-0 w-72 shrink-0 flex-col border-l border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink-900">处理结果</h2>
          <span className="text-xs text-ink-500">{results.length}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {results.length ? (
            <div className="space-y-3">
              {results.map((item) => (
                <div key={item.id} className="border border-line bg-canvas/40 p-3">
                  <div className="aspect-square overflow-hidden rounded-md bg-[repeating-conic-gradient(#f1f3f5_0%_25%,#fff_0%_50%)] bg-[size:16px_16px]">
                    <ArtifactImage artifact={item} label={`抠图结果：${item.name}`} className="h-full w-full object-contain" />
                  </div>
                  <p className="mt-3 truncate text-sm font-medium text-ink-900" title={item.name}>{item.name}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <a
                      href={rawArtifactUrl(item.id)}
                      download={item.name}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800"
                    >
                      <Download className="h-4 w-4" /> 透明底
                    </a>
                    <button
                      type="button"
                      onClick={() => void downloadWhiteBackground(item)}
                      className="text-sm font-medium text-primary-700 hover:text-primary-800"
                    >
                      白底
                    </button>
                  </div>
                </div>
              ))}
              {result ? (
                <Link
                  href={continueHref}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800"
                >
                  <MessageSquare className="h-4 w-4" /> 在对话中继续
                </Link>
              ) : null}
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
