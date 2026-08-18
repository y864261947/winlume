"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Download, ImagePlus, LoaderCircle, RefreshCw, Upload } from "lucide-react";
import { useModals } from "@/components/providers";
import type { Artifact } from "@/lib/agent/types";
import {
  MAX_IMAGE_BYTES,
  formatFileSize,
  readFileAsDataUrl,
} from "@/lib/studio/composer-attachments";
import {
  StudioApiError,
  getArtifact,
  listArtifacts,
  withUserHeaders,
} from "@/lib/studio/api";
import { subscribeArtifactStream } from "@/lib/studio/artifact-stream-client";
import {
  initialStudioToolParams,
  isStudioToolImageMimeType,
  type StudioTool,
  type StudioToolParams,
} from "@/lib/studio/tool-catalog";
import type { EcommerceImageSetJob } from "@/lib/studio/tool-jobs";

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

function isReadyArtifact(artifact: Artifact): boolean {
  return artifact.status !== "pending" && artifact.status !== "failed";
}

export default function ToolRunForm({ tool }: { tool: StudioTool }) {
  const { account, accountLoading, openLogin } = useModals();
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(true);
  const [artifactsError, setArtifactsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [results, setResults] = useState<Artifact[]>([]);
  const [toolJob, setToolJob] = useState<EcommerceImageSetJob | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);
  const toolJobId = toolJob?.id;
  const toolJobStage = toolJob?.stage;
  const [params, setParams] = useState<StudioToolParams>(() => initialStudioToolParams(tool));
  const [prompt, setPrompt] = useState("");

  const toolImageArtifacts = useMemo(
    () =>
      artifacts.filter(
        (artifact) =>
          artifact.kind === "image" &&
          artifact.status === "ready" &&
          isStudioToolImageMimeType(artifact.mimeType),
      ),
    [artifacts],
  );
  const selectedArtifacts = useMemo(
    () => selectedIds.flatMap((id) => {
      const artifact = toolImageArtifacts.find((item) => item.id === id);
      return artifact ? [artifact] : [];
    }),
    [selectedIds, toolImageArtifacts],
  );
  const hasRequiredImages =
    selectedIds.length >= tool.input.minImages && selectedIds.length <= tool.input.maxImages;
  const hasValidPrompt =
    !tool.input.prompt ||
    (prompt.trim().length <= tool.input.prompt.maxLength &&
      (!tool.input.prompt.required || prompt.trim().length > 0));
  const pendingArtifactIdsKey = useMemo(
    () => results
      .filter((artifact) => artifact.status === "pending")
      .map((artifact) => artifact.id)
      .join("|"),
    [results],
  );
  const outputAspectClass =
    params.size === "1536x1024"
      ? "aspect-[3/2]"
      : params.size === "1024x1536"
        ? "aspect-[2/3]"
        : "aspect-square";

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
        setSelectedIds((current) => {
          if (current.includes(artifact.id)) return current;
          return current.length < tool.input.maxImages ? [...current, artifact.id] : [artifact.id];
        });
        setResults([]);
        setToolJob(null);
      } catch (error) {
        if (error instanceof StudioApiError && error.status === 401) openLogin("login");
        setRunError(error instanceof Error ? error.message : "图片上传失败");
      } finally {
        setUploading(false);
      }
    },
    [openLogin, tool.id, tool.input.maxImages, uploading],
  );

  const onImageDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current += 1;
    if (account && !uploading) setDragOver(true);
  }, [account, uploading]);

  const onImageDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  }, []);

  const onImageDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const onImageDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);

    const files = Array.from(event.dataTransfer.files);
    if (!files.length || uploading) return;
    if (!account) {
      openLogin("login");
      return;
    }
    if (files.length > 1) {
      setRunError("一次只能拖入 1 张图片，请逐张添加。");
      return;
    }
    void uploadImage(files[0] ?? null);
  }, [account, openLogin, uploadImage, uploading]);

  const run = useCallback(async () => {
    if (running) return;
    if (!account) {
      openLogin("login");
      return;
    }
    if (!hasRequiredImages) {
      setRunError(
        tool.input.minImages === tool.input.maxImages
          ? `请选择 ${tool.input.minImages} 张图片`
          : `请选择至少 ${tool.input.minImages} 张图片`,
      );
      return;
    }
    if (!hasValidPrompt) {
      setRunError(`请填写${tool.input.prompt?.label ?? "说明"}`);
      return;
    }
    setRunning(true);
    setRunError(null);
    try {
      const response = await fetch(`/api/tools/${encodeURIComponent(tool.id)}/run`, {
        method: "POST",
        headers: withUserHeaders(),
        credentials: "same-origin",
        body: JSON.stringify(
          tool.id === "image-fusion"
            ? { sourceArtifactIds: selectedIds, prompt: prompt.trim(), params }
            : tool.id === "ecommerce-image-set"
              ? {
                  sourceArtifactId: selectedIds[0],
                  ...(selectedIds[1] ? { referenceArtifactId: selectedIds[1] } : {}),
                  prompt: prompt.trim(),
                  params,
                }
              : { sourceArtifactId: selectedIds[0], params },
        ),
      });
      const responseBody = await parseResponse<{
        artifact?: Artifact;
        artifacts?: Artifact[];
        job?: EcommerceImageSetJob;
      }>(response, `${tool.name}失败`);
      const created = responseBody.artifacts ?? (responseBody.artifact ? [responseBody.artifact] : []);
      if (!created.length) throw new Error(`${tool.name}没有返回作品`);
      setResults(created);
      setToolJob(responseBody.job ?? null);
      setArtifacts((current) => [
        ...created,
        ...current.filter((item) => !created.some((artifact) => artifact.id === item.id)),
      ]);
    } catch (error) {
      if (error instanceof StudioApiError && error.status === 401) openLogin("login");
      setRunError(error instanceof Error ? error.message : `${tool.name}失败`);
    } finally {
      setRunning(false);
    }
  }, [
    account,
    hasRequiredImages,
    hasValidPrompt,
    openLogin,
    params,
    prompt,
    running,
    selectedIds,
    tool.id,
    tool.input.maxImages,
    tool.input.minImages,
    tool.input.prompt?.label,
    tool.name,
  ]);

  useEffect(() => {
    if (!pendingArtifactIdsKey) return;
    const artifactIds = pendingArtifactIdsKey.split("|");
    let active = true;

    const refreshResults = async (ids: readonly string[]) => {
      const settled = await Promise.allSettled(ids.map(async (id) => (await getArtifact(id)).artifact));
      if (!active) return;
      const refreshed = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
      if (!refreshed.length) return;
      const refreshedById = new Map(refreshed.map((artifact) => [artifact.id, artifact]));
      setResults((current) => current.map((artifact) => refreshedById.get(artifact.id) ?? artifact));
      setArtifacts((current) => [
        ...refreshed,
        ...current.filter((item) => !refreshedById.has(item.id)),
      ]);
      const failed = refreshed.find((artifact) => artifact.status === "failed");
      if (failed) setRunError(failed.error ?? `${tool.name}失败`);
    };

    void refreshResults(artifactIds);
    const unsubscribe = subscribeArtifactStream((event) => {
      if (artifactIds.includes(event.artifactId) && event.status !== "pending") {
        void refreshResults([event.artifactId]);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [pendingArtifactIdsKey, tool.name]);

  useEffect(() => {
    if (!toolJobId || toolJobStage !== "generating") return;
    let active = true;

    const refreshJob = async () => {
      try {
        const response = await fetch(`/api/tool-jobs/${encodeURIComponent(toolJobId)}`, {
          headers: withUserHeaders(),
          credentials: "same-origin",
        });
        const body = await parseResponse<{ job: EcommerceImageSetJob }>(response, "任务状态读取失败");
        if (active) setToolJob(body.job);
      } catch {
        // The artifacts continue to show their own status if this optional
        // progress refresh is briefly unavailable.
      }
    };

    void refreshJob();
    const interval = window.setInterval(() => void refreshJob(), 2_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [toolJobId, toolJobStage]);

  const canSubmitParameters = tool.parameters.every(
    (field) => field.type !== "checkbox" || !field.required || params[field.id] === true,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-canvas/35 xl:flex-row xl:overflow-hidden">
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
        className="flex w-full shrink-0 flex-col border-b border-line bg-surface xl:min-h-0 xl:w-80 xl:border-b-0 xl:border-r"
      >
        <div className="border-b border-line px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">处理图片</h2>
              <p className="mt-1 text-xs text-ink-500">
                {tool.inputHint}
                {tool.input.maxImages > 1 ? ` 已选 ${selectedIds.length}/${tool.input.maxImages} 张。` : ""}
              </p>
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

        {tool.input.prompt || tool.parameters.length ? (
          <div className="space-y-4 border-b border-line px-5 py-4">
            {tool.input.prompt ? (
              <label htmlFor={`tool-${tool.id}-prompt`} className="block">
                <span className="text-sm font-medium text-ink-900">{tool.input.prompt.label}</span>
                <span className="mt-1 block text-xs leading-5 text-ink-500">
                  {tool.input.prompt.description}
                </span>
                <textarea
                  id={`tool-${tool.id}-prompt`}
                  value={prompt}
                  maxLength={tool.input.prompt.maxLength}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={tool.input.prompt.placeholder}
                  rows={5}
                  className="mt-2 block w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-sm leading-6 text-ink-900 outline-none transition placeholder:text-ink-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-500/15"
                />
                <span className="mt-1 block text-right text-xs text-ink-400">
                  {prompt.length}/{tool.input.prompt.maxLength}
                </span>
              </label>
            ) : null}
            {tool.parameters.map((field) => {
              const controlId = `tool-${tool.id}-${field.id}`;
              if (field.type === "checkbox") {
                const checked = params[field.id] === true;
                return (
                  <label key={field.id} className="flex cursor-pointer items-start gap-3 text-sm text-ink-800">
                    <input
                      id={controlId}
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => setParams((current) => ({
                        ...current,
                        [field.id]: event.target.checked,
                      }))}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
                    />
                    <span>
                      <span className="font-medium">{field.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-ink-500">{field.description}</span>
                    </span>
                  </label>
                );
              }
              const parameterValue = params[field.id];
              const value = typeof parameterValue === "string" ? parameterValue : "";
              return (
                <label key={field.id} htmlFor={controlId} className="block">
                  <span className="text-sm font-medium text-ink-900">{field.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-ink-500">{field.description}</span>
                  <select
                    id={controlId}
                    value={value}
                    onChange={(event) => setParams((current) => ({
                      ...current,
                      [field.id]: event.target.value,
                    }))}
                    className="mt-2 h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink-900 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-500/15"
                  >
                    {field.options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        ) : null}

        <div
          className="relative min-h-0 flex-1 overflow-y-auto p-4"
          onDragEnter={onImageDragEnter}
          onDragLeave={onImageDragLeave}
          onDragOver={onImageDragOver}
          onDrop={onImageDrop}
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
              <span className="mt-3">上传第一张图片</span>
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
                const selectionIndex = selectedIds.indexOf(artifact.id);
                const active = selectionIndex !== -1;
                return (
                  <button
                    key={artifact.id}
                    type="button"
                    onClick={() => {
                      if (active) {
                        setSelectedIds((current) => current.filter((id) => id !== artifact.id));
                      } else if (selectedIds.length < tool.input.maxImages) {
                        setSelectedIds((current) => [...current, artifact.id]);
                      } else {
                        setRunError(`最多选择 ${tool.input.maxImages} 张图片`);
                        return;
                      }
                      setResults([]);
                      setToolJob(null);
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
                        <span className="text-xs font-semibold">{selectionIndex + 1}</span>
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
          {dragOver ? (
            <div className="pointer-events-none absolute inset-4 z-10 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-primary-500 bg-primary-50/90 px-5 text-center text-sm font-medium text-primary-800">
              <Upload className="h-6 w-6" />
              <span className="mt-2">松开以上传图片</span>
            </div>
          ) : null}
        </div>

        <div className="border-t border-line bg-surface p-4">
          {runError ? <p role="alert" className="mb-3 border-l-2 border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-700">{runError}</p> : null}
          <button
            type="submit"
            disabled={
              running ||
              uploading ||
              !hasRequiredImages ||
              !hasValidPrompt ||
              !account ||
              !canSubmitParameters
            }
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink-950 px-4 text-sm font-semibold text-white transition hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {running ? tool.runningLabel : tool.actionLabel}
          </button>
        </div>
      </form>

      <main className="flex min-h-[20rem] min-w-0 flex-1 items-center justify-center p-6 xl:min-h-0 xl:overflow-y-auto xl:p-8">
        {results.length ? (
          <div className="w-full max-w-[760px]">
            <p className="mb-3 text-center text-sm font-medium text-ink-700">
              {results.some((artifact) => artifact.status === "pending")
                ? toolJob
                  ? `任务已进入生成阶段 ${results.filter(isReadyArtifact).length}/${results.length} 张`
                  : `正在生成 ${results.filter(isReadyArtifact).length}/${results.length} 张`
                : toolJob?.stage === "review"
                  ? "套图已生成，请确认商品细节后逐张下载"
                  : tool.outputHint}
            </p>
            <div className={results.length > 1 ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" : ""}>
              {results.map((artifact) => (
                <div key={artifact.id}>
                  <p className="mb-2 truncate text-center text-xs font-medium text-ink-500" title={artifact.name}>
                    {artifact.name}
                  </p>
                  {isReadyArtifact(artifact) ? (
                    <div className={`${outputAspectClass} overflow-hidden rounded-lg border border-line bg-[repeating-conic-gradient(#f1f3f5_0%_25%,#fff_0%_50%)] bg-[size:20px_20px] shadow-sm`}>
                      <ArtifactImage artifact={artifact} label={`${tool.name}结果：${artifact.name}`} className="h-full w-full object-contain" />
                    </div>
                  ) : artifact.status === "pending" ? (
                    <div className={`${outputAspectClass} flex items-center justify-center rounded-lg border border-line bg-canvas/50`}>
                      <LoaderCircle className="h-7 w-7 animate-spin text-primary-600" />
                    </div>
                  ) : (
                    <div className={`${outputAspectClass} flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50/60 px-4 text-center text-sm text-rose-700`}>
                      {artifact.error ?? "处理未完成"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : selectedArtifacts.length ? (
          <div className="w-full max-w-[560px]">
            <p className="mb-3 text-center text-sm font-medium text-ink-700">
              {tool.input.maxImages > 1 ? "已选图片" : "原图预览"}
            </p>
            <div className={selectedArtifacts.length > 1 ? "grid grid-cols-2 gap-3" : ""}>
              {selectedArtifacts.map((artifact, index) => (
                <div key={artifact.id}>
                  {tool.input.maxImages > 1 ? (
                    <p className="mb-2 text-center text-xs font-medium text-ink-500">
                      {tool.id === "ecommerce-image-set"
                        ? index === 0 ? "商品图" : "爆款参考图"
                        : `图片 ${index + 1}`}
                    </p>
                  ) : null}
                  <div className="aspect-square overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
                    <ArtifactImage artifact={artifact} label={`原图：${artifact.name}`} className="h-full w-full object-contain" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-sm text-center">
            <ImagePlus className="mx-auto h-9 w-9 text-ink-300" />
            <p className="mt-4 text-base font-semibold text-ink-700">选择图片</p>
            <p className="mt-2 text-sm leading-6 text-ink-500">处理结果会显示在这里。</p>
          </div>
        )}
      </main>

      <aside className="flex min-h-64 w-full shrink-0 flex-col border-t border-line bg-surface xl:min-h-0 xl:w-72 xl:border-l xl:border-t-0">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink-900">处理结果</h2>
          <span className="text-xs text-ink-500">{results.length}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {results.length ? (
            <div className="space-y-3">
              {results.map((artifact) => (
                <div key={artifact.id} className="border border-line bg-canvas/40 p-3">
                  {isReadyArtifact(artifact) ? (
                    <div className={`${outputAspectClass} overflow-hidden rounded-md bg-[repeating-conic-gradient(#f1f3f5_0%_25%,#fff_0%_50%)] bg-[size:16px_16px]`}>
                      <ArtifactImage artifact={artifact} label={`${tool.name}结果：${artifact.name}`} className="h-full w-full object-contain" />
                    </div>
                  ) : artifact.status === "pending" ? (
                    <div className={`${outputAspectClass} flex items-center justify-center rounded-md bg-canvas/60`}>
                      <LoaderCircle className="h-6 w-6 animate-spin text-primary-600" />
                    </div>
                  ) : (
                    <div className={`${outputAspectClass} flex items-center justify-center rounded-md bg-rose-50 px-3 text-center text-xs text-rose-700`}>
                      {artifact.error ?? "处理未完成"}
                    </div>
                  )}
                  <p className="mt-3 truncate text-sm font-medium text-ink-900" title={artifact.name}>{artifact.name}</p>
                  {isReadyArtifact(artifact) ? (
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <a
                        href={`/api/artifacts/${encodeURIComponent(artifact.id)}/raw`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:text-primary-800"
                      >
                        <Download className="h-4 w-4" /> 下载
                      </a>
                      <Link href="/studio/artifacts" className="text-sm font-medium text-primary-700 hover:text-primary-800">
                        我的作品
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))}
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
