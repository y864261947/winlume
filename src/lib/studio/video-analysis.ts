/**
 * Stable, user-facing contract for the reference-video analysis MVP.
 *
 * Media workers may use FFmpeg, PySceneDetect, ASR, or a vision model, but
 * their implementation details must not leak into Studio artifacts. This
 * JSON envelope is the hand-off between those workers and the UI.
 */

export const VIDEO_ANALYSIS_SCHEMA_VERSION = 1 as const;

export type VideoAnalysisStage =
  | "queued"
  | "probing"
  | "detecting_scenes"
  | "transcribing"
  | "interpreting"
  | "ready"
  | "failed";

export type VideoAnalysisGoal = "script" | "storyboard" | "both";

export type VideoSourceInfo = {
  durationMs: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio?: boolean;
};

export type VideoAnalysisScene = {
  id: string;
  startMs: number;
  endMs: number;
  purpose: string;
  visual: string;
  narration: string;
  screenText: string[];
  shot: string;
  edit: string;
  recreation: string;
};

export type VideoAnalysisSummary = {
  hook: string;
  pacing: string;
  structure: string;
  callToAction: string;
  recreationDirection: string;
};

export type VideoAnalysisContent = {
  version: typeof VIDEO_ANALYSIS_SCHEMA_VERSION;
  sourceArtifactId: string;
  jobId: string;
  goal: VideoAnalysisGoal;
  stage: VideoAnalysisStage;
  source?: VideoSourceInfo;
  summary?: VideoAnalysisSummary;
  transcript?: string;
  scenes: VideoAnalysisScene[];
  error?: string;
  updatedAt: string;
};

export type VideoAnalysisJob = {
  id: string;
  userId: string;
  sessionId: string;
  projectId?: string;
  sourceArtifactId: string;
  analysisArtifactId: string;
  goal: VideoAnalysisGoal;
  stage: VideoAnalysisStage;
  createdAt: string;
  updatedAt: string;
  error?: string;
};

const STAGES: readonly VideoAnalysisStage[] = [
  "queued",
  "probing",
  "detecting_scenes",
  "transcribing",
  "interpreting",
  "ready",
  "failed",
];

const GOALS: readonly VideoAnalysisGoal[] = ["script", "storyboard", "both"];

export function isVideoAnalysisStage(value: unknown): value is VideoAnalysisStage {
  return typeof value === "string" && STAGES.includes(value as VideoAnalysisStage);
}

export function isVideoAnalysisGoal(value: unknown): value is VideoAnalysisGoal {
  return typeof value === "string" && GOALS.includes(value as VideoAnalysisGoal);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function sceneFromUnknown(value: unknown, index: number): VideoAnalysisScene | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const startMs = raw.startMs;
  const endMs = raw.endMs;
  if (!finiteNonNegative(startMs) || !finiteNonNegative(endMs) || endMs <= startMs) {
    return null;
  }
  const rawScreenText = Array.isArray(raw.screenText)
    ? raw.screenText.filter((item): item is string => typeof item === "string")
    : [];
  return {
    id: text(raw.id, `scene-${index + 1}`) || `scene-${index + 1}`,
    startMs: Math.round(startMs),
    endMs: Math.round(endMs),
    purpose: text(raw.purpose),
    visual: text(raw.visual),
    narration: text(raw.narration),
    screenText: rawScreenText.map((item) => item.trim()).filter(Boolean),
    shot: text(raw.shot),
    edit: text(raw.edit),
    recreation: text(raw.recreation),
  };
}

function summaryFromUnknown(value: unknown): VideoAnalysisSummary | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  return {
    hook: text(raw.hook),
    pacing: text(raw.pacing),
    structure: text(raw.structure),
    callToAction: text(raw.callToAction),
    recreationDirection: text(raw.recreationDirection),
  };
}

function sourceFromUnknown(value: unknown): VideoSourceInfo | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (!finiteNonNegative(raw.durationMs)) return undefined;
  const result: VideoSourceInfo = { durationMs: Math.round(raw.durationMs) };
  if (finiteNonNegative(raw.width)) result.width = Math.round(raw.width);
  if (finiteNonNegative(raw.height)) result.height = Math.round(raw.height);
  if (finiteNonNegative(raw.fps)) result.fps = raw.fps;
  if (typeof raw.hasAudio === "boolean") result.hasAudio = raw.hasAudio;
  return result;
}

/** Parse persisted data defensively. Invalid worker output must not break the works panel. */
export function parseVideoAnalysisContent(raw: string | unknown): VideoAnalysisContent | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (
    source.version !== VIDEO_ANALYSIS_SCHEMA_VERSION ||
    typeof source.sourceArtifactId !== "string" ||
    !source.sourceArtifactId.trim() ||
    typeof source.jobId !== "string" ||
    !source.jobId.trim() ||
    !isVideoAnalysisGoal(source.goal) ||
    !isVideoAnalysisStage(source.stage) ||
    typeof source.updatedAt !== "string"
  ) {
    return null;
  }
  const scenes = Array.isArray(source.scenes)
    ? source.scenes
        .map((scene, index) => sceneFromUnknown(scene, index))
        .filter((scene): scene is VideoAnalysisScene => scene !== null)
    : [];
  return {
    version: VIDEO_ANALYSIS_SCHEMA_VERSION,
    sourceArtifactId: source.sourceArtifactId.trim(),
    jobId: source.jobId.trim(),
    goal: source.goal,
    stage: source.stage,
    ...(sourceFromUnknown(source.source) ? { source: sourceFromUnknown(source.source) } : {}),
    ...(summaryFromUnknown(source.summary) ? { summary: summaryFromUnknown(source.summary) } : {}),
    ...(typeof source.transcript === "string" ? { transcript: source.transcript } : {}),
    scenes,
    ...(typeof source.error === "string" && source.error.trim()
      ? { error: source.error.trim() }
      : {}),
    updatedAt: source.updatedAt,
  };
}

export function serializeVideoAnalysisContent(content: VideoAnalysisContent): string {
  return `${JSON.stringify(content)}\n`;
}

export function createPendingVideoAnalysis(input: {
  sourceArtifactId: string;
  jobId: string;
  goal?: VideoAnalysisGoal;
  now?: Date;
}): VideoAnalysisContent {
  return {
    version: VIDEO_ANALYSIS_SCHEMA_VERSION,
    sourceArtifactId: input.sourceArtifactId,
    jobId: input.jobId,
    goal: input.goal ?? "both",
    stage: "queued",
    scenes: [],
    updatedAt: (input.now ?? new Date()).toISOString(),
  };
}

export function stageLabel(stage: VideoAnalysisStage): string {
  switch (stage) {
    case "queued":
      return "等待分析";
    case "probing":
      return "读取视频信息";
    case "detecting_scenes":
      return "识别镜头";
    case "transcribing":
      return "转写口播";
    case "interpreting":
      return "整理脚本与分镜";
    case "ready":
      return "拆解完成";
    case "failed":
      return "分析失败";
  }
}

export function formatVideoTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
