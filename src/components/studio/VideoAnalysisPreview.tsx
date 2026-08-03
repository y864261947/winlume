"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Clapperboard,
  Clock3,
  LoaderCircle,
  Play,
  RotateCw,
  Save,
} from "lucide-react";
import type { Artifact } from "@/lib/agent/types";
import { retryQueuedVideoAnalysis, withUserHeaders } from "@/lib/studio/api";
import {
  formatVideoTime,
  parseVideoAnalysisContent,
  serializeVideoAnalysisContent,
  stageLabel,
  type VideoAnalysisContent,
  type VideoAnalysisScene,
  type VideoAnalysisSummary,
} from "@/lib/studio/video-analysis";

type VideoAnalysisPreviewProps = {
  artifact: Artifact;
  content: string;
  /** Refreshes parent artifact content after saving or re-dispatching. */
  onPersisted?: () => void;
};

const SUMMARY_FIELDS: Array<{ key: keyof VideoAnalysisSummary; label: string }> = [
  { key: "hook", label: "开场钩子" },
  { key: "pacing", label: "节奏" },
  { key: "structure", label: "结构" },
  { key: "callToAction", label: "收束动作" },
  { key: "recreationDirection", label: "可复用方向" },
];

function inputClassName(editable: boolean): string {
  return `w-full resize-y border-0 border-b border-line/70 bg-transparent px-0 py-1 text-xs leading-5 text-ink-800 outline-none transition placeholder:text-ink-300 focus:border-[#0F172A] disabled:cursor-default disabled:border-transparent ${
    editable ? "" : "opacity-90"
  }`;
}

function sourceLabel(content: VideoAnalysisContent): string | null {
  const source = content.source;
  if (!source) return null;
  const parts = [formatVideoTime(source.durationMs)];
  if (source.width && source.height) parts.push(`${source.width} x ${source.height}`);
  if (source.fps) parts.push(`${source.fps.toFixed(1)} fps`);
  if (source.hasAudio !== undefined) parts.push(source.hasAudio ? "含音频" : "无音频");
  return parts.join(" · ");
}

function fieldValue(scene: VideoAnalysisScene, field: keyof VideoAnalysisScene): string {
  const value = scene[field];
  return typeof value === "string" ? value : "";
}

export default function VideoAnalysisPreview({
  artifact,
  content,
  onPersisted,
}: VideoAnalysisPreviewProps) {
  const parsed = useMemo(() => parseVideoAnalysisContent(content), [content]);
  const [analysis, setAnalysis] = useState<VideoAnalysisContent | null>(parsed);
  const [savedSnapshot, setSavedSnapshot] = useState(
    parsed ? serializeVideoAnalysisContent(parsed) : "",
  );
  const [saving, setSaving] = useState(false);
  const [redispatching, setRedispatching] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const playerRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setAnalysis(parsed);
    setSavedSnapshot(parsed ? serializeVideoAnalysisContent(parsed) : "");
    setSaving(false);
    setRedispatching(false);
    setSaveError(null);
  }, [artifact.id, parsed]);

  const isDirty = Boolean(
    analysis && serializeVideoAnalysisContent(analysis) !== savedSnapshot,
  );
  const editable = analysis?.stage === "ready";

  const seekTo = useCallback((milliseconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = milliseconds / 1000;
  }, []);

  const updateSummary = useCallback(
    (key: keyof VideoAnalysisSummary, value: string) => {
      setAnalysis((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          summary: {
            hook: previous.summary?.hook ?? "",
            pacing: previous.summary?.pacing ?? "",
            structure: previous.summary?.structure ?? "",
            callToAction: previous.summary?.callToAction ?? "",
            recreationDirection: previous.summary?.recreationDirection ?? "",
            [key]: value,
          },
        };
      });
    },
    [],
  );

  const updateTranscript = useCallback((value: string) => {
    setAnalysis((previous) => (previous ? { ...previous, transcript: value } : previous));
  }, []);

  const updateScene = useCallback(
    (
      index: number,
      field: keyof Pick<
        VideoAnalysisScene,
        "purpose" | "visual" | "narration" | "shot" | "edit" | "recreation"
      >,
      value: string,
    ) => {
      setAnalysis((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          scenes: previous.scenes.map((scene, sceneIndex) =>
            sceneIndex === index ? { ...scene, [field]: value } : scene,
          ),
        };
      });
    },
    [],
  );

  const updateScreenText = useCallback((index: number, value: string) => {
    setAnalysis((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        scenes: previous.scenes.map((scene, sceneIndex) =>
          sceneIndex === index
            ? {
                ...scene,
                screenText: value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean),
              }
            : scene,
        ),
      };
    });
  }, []);

  const save = useCallback(async () => {
    if (!analysis || !editable || !isDirty || saving) return;
    const next: VideoAnalysisContent = {
      ...analysis,
      stage: "ready",
      updatedAt: new Date().toISOString(),
    };
    const serialized = serializeVideoAnalysisContent(next);
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/artifacts/${encodeURIComponent(artifact.id)}`, {
        method: "PUT",
        headers: withUserHeaders(),
        body: JSON.stringify({ content: serialized }),
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "保存拆解失败");
      }
      setAnalysis(next);
      setSavedSnapshot(serialized);
      onPersisted?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存拆解失败");
    } finally {
      setSaving(false);
    }
  }, [analysis, artifact.id, editable, isDirty, onPersisted, saving]);

  const redispatch = useCallback(async () => {
    if (!analysis || analysis.stage !== "queued" || redispatching) return;
    setRedispatching(true);
    setSaveError(null);
    try {
      await retryQueuedVideoAnalysis(artifact.id);
      setAnalysis((previous) => {
        if (!previous) return previous;
        const { error: _error, ...withoutError } = previous;
        return { ...withoutError, updatedAt: new Date().toISOString() };
      });
      onPersisted?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "重新派发视频拆解失败");
    } finally {
      setRedispatching(false);
    }
  }, [analysis, artifact.id, onPersisted, redispatching]);

  if (!analysis) {
    return (
      <div className="px-4 py-6 text-sm text-rose-600">
        视频拆解数据无法读取，请刷新后重试。
      </div>
    );
  }

  const source = sourceLabel(analysis);
  const isPending = analysis.stage !== "ready" && analysis.stage !== "failed";

  return (
    <div className="flex min-h-0 flex-col bg-surface">
      <div className="border-b border-line/70 bg-canvas/35 px-3 py-3">
        <div className="overflow-hidden rounded-[8px] bg-black">
          <video
            ref={playerRef}
            controls
            preload="metadata"
            src={`/api/artifacts/${encodeURIComponent(analysis.sourceArtifactId)}/raw`}
            className="aspect-video w-full object-contain"
          >
            当前浏览器无法播放该视频。
          </video>
        </div>
        {source ? <p className="mt-2 text-[11px] text-ink-500">{source}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 border-b border-line/70 px-3 py-2">
        {analysis.stage === "ready" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
        ) : analysis.stage === "failed" ? (
          <CircleAlert className="h-4 w-4 shrink-0 text-rose-600" />
        ) : (
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-primary-500" />
        )}
        <span className="min-w-0 flex-1 text-xs font-medium text-ink-800">
          {stageLabel(analysis.stage)}
        </span>
        {editable ? (
          <button
            type="button"
            onClick={() => void save()}
            disabled={!isDirty || saving}
            title="保存拆解修改"
            className="inline-flex h-7 items-center gap-1 rounded-[6px] bg-[#0F172A] px-2 text-[11px] font-medium text-white transition hover:bg-[#1E293B] disabled:cursor-default disabled:opacity-40"
          >
            {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "保存中" : isDirty ? "保存" : "已保存"}
          </button>
        ) : null}
        {analysis.stage === "queued" && analysis.error ? (
          <button
            type="button"
            onClick={() => void redispatch()}
            disabled={redispatching}
            title="重新派发视频拆解任务"
            className="inline-flex h-7 items-center gap-1 rounded-[6px] border border-line bg-white px-2 text-[11px] font-medium text-[#0F172A] transition hover:bg-canvas disabled:cursor-default disabled:opacity-40"
          >
            <RotateCw className={`h-3.5 w-3.5 ${redispatching ? "animate-spin" : ""}`} />
            {redispatching ? "派发中" : "重新派发"}
          </button>
        ) : null}
      </div>

      {analysis.error ? (
        <p
          className={`shrink-0 border-b px-3 py-2 text-[11px] leading-5 ${
            analysis.stage === "failed"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {analysis.error}
        </p>
      ) : null}

      {saveError ? (
        <p className="shrink-0 border-b border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
          {saveError}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {isPending ? (
          <div className="flex items-start gap-2 border-b border-line/70 pb-4 text-xs leading-5 text-ink-500">
            <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>拆解结果会在当前作品中持续更新。</p>
          </div>
        ) : null}

        <section aria-labelledby="video-analysis-summary">
          <div className="mb-2 flex items-center gap-1.5">
            <Clapperboard className="h-3.5 w-3.5 text-primary-500" />
            <h3 id="video-analysis-summary" className="text-xs font-semibold text-ink-900">
              结构拆解
            </h3>
          </div>
          <div className="space-y-2">
            {SUMMARY_FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="block text-[10px] font-medium text-ink-500">{field.label}</span>
                <textarea
                  rows={2}
                  value={analysis.summary?.[field.key] ?? ""}
                  disabled={!editable}
                  onChange={(event) => updateSummary(field.key, event.target.value)}
                  placeholder={editable ? "补充拆解结论" : "待分析"}
                  className={inputClassName(editable)}
                />
              </label>
            ))}
          </div>
        </section>

        <section aria-labelledby="video-analysis-scenes">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 id="video-analysis-scenes" className="text-xs font-semibold text-ink-900">
              分镜
            </h3>
            <span className="text-[10px] tabular-nums text-ink-400">
              {analysis.scenes.length} 段
            </span>
          </div>
          {analysis.scenes.length === 0 ? (
            <p className="border-y border-line/70 py-4 text-xs text-ink-400">
              {analysis.stage === "failed" ? "没有可用的分镜结果。" : "镜头结构仍在整理。"}
            </p>
          ) : (
            <div className="space-y-2">
              {analysis.scenes.map((scene, index) => (
                <article key={scene.id} className="border border-line/80 bg-canvas/25 p-2.5">
                  <div className="mb-2 flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => seekTo(scene.startMs)}
                      title={`跳转到 ${formatVideoTime(scene.startMs)}`}
                      className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-white px-1.5 py-1 text-[10px] font-medium tabular-nums text-[#0F172A] shadow-sm transition hover:bg-canvas"
                    >
                      <Play className="h-3 w-3" />
                      {formatVideoTime(scene.startMs)}-{formatVideoTime(scene.endMs)}
                    </button>
                    <p className="min-w-0 flex-1 pt-0.5 text-xs font-medium leading-5 text-ink-800">
                      {scene.purpose || `镜头 ${String(index + 1).padStart(2, "0")}`}
                    </p>
                  </div>
                  <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
                    {(
                      [
                        ["purpose", "目的"],
                        ["visual", "画面"],
                        ["narration", "口播"],
                        ["shot", "景别/运镜"],
                        ["edit", "剪辑"],
                        ["recreation", "复用建议"],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field} className="block">
                        <span className="block text-[10px] font-medium text-ink-500">{label}</span>
                        <textarea
                          rows={2}
                          value={fieldValue(scene, field)}
                          disabled={!editable}
                          onChange={(event) => updateScene(index, field, event.target.value)}
                          placeholder={editable ? "补充内容" : "-"}
                          className={inputClassName(editable)}
                        />
                      </label>
                    ))}
                    <label className="block sm:col-span-2">
                      <span className="block text-[10px] font-medium text-ink-500">屏幕文字</span>
                      <textarea
                        rows={Math.max(2, scene.screenText.length)}
                        value={scene.screenText.join("\n")}
                        disabled={!editable}
                        onChange={(event) => updateScreenText(index, event.target.value)}
                        placeholder={editable ? "每行一条屏幕文字" : "-"}
                        className={inputClassName(editable)}
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="video-analysis-transcript">
          <h3 id="video-analysis-transcript" className="mb-2 text-xs font-semibold text-ink-900">
            口播转写
          </h3>
          <textarea
            rows={6}
            value={analysis.transcript ?? ""}
            disabled={!editable}
            onChange={(event) => updateTranscript(event.target.value)}
            placeholder={editable ? "补充转写内容" : "暂无转写"}
            className={inputClassName(editable)}
          />
        </section>
      </div>
    </div>
  );
}
