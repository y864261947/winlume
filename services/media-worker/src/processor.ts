import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  VIDEO_ANALYSIS_SCHEMA_VERSION,
  formatVideoTime,
  type VideoAnalysisContent,
  type VideoAnalysisScene,
  type VideoSourceInfo,
} from "../../../src/lib/studio/video-analysis";
import { MEDIA_WORKER_AUTH_HEADER } from "./auth";
import type { MediaWorkerConfig } from "./config";
import type { MediaWorkerJob } from "./types";

type CallbackPayload = {
  stage: "probing" | "detecting_scenes" | "interpreting" | "ready" | "failed";
  analysis?: VideoAnalysisContent;
  error?: string;
};

type ProbeDocument = {
  format?: { duration?: string };
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
  }>;
};

type CommandOutput = { stdout: string; stderr: string };

function shortError(error: unknown): string {
  const message = error instanceof Error ? error.message : "媒体分析失败";
  return message.replace(/\s+/g, " ").slice(0, 360);
}

function routeUrl(config: MediaWorkerConfig, path: string): string {
  return new URL(path, `${config.studioUrl}/`).toString();
}

async function postCallback(
  config: MediaWorkerConfig,
  job: MediaWorkerJob,
  body: CallbackPayload,
): Promise<void> {
  const response = await fetch(
    routeUrl(config, `api/video/jobs/${encodeURIComponent(job.id)}/callback`),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [MEDIA_WORKER_AUTH_HEADER]: config.workerToken,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
    },
  );
  if (!response.ok) {
    throw new Error(`Studio callback returned ${response.status}`);
  }
}

async function downloadSource(
  config: MediaWorkerConfig,
  job: MediaWorkerJob,
  destination: string,
): Promise<void> {
  const response = await fetch(
    routeUrl(config, `api/video/jobs/${encodeURIComponent(job.id)}/source`),
    {
      headers: { [MEDIA_WORKER_AUTH_HEADER]: config.workerToken },
      cache: "no-store",
      redirect: "error",
    },
  );
  if (!response.ok || !response.body) {
    throw new Error(`无法读取源视频（${response.status}）`);
  }
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > config.maxSourceBytes) {
    throw new Error("源视频超过媒体 Worker 的处理上限");
  }

  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > config.maxSourceBytes) {
        callback(new Error("源视频超过媒体 Worker 的处理上限"));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    limiter,
    createWriteStream(destination, { flags: "w" }),
  );
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<CommandOutput> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const finish = (error?: Error, value?: CommandOutput) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value!);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    if (!child.stdout || !child.stderr) {
      finish(new Error(`${command} did not provide output streams`));
      return;
    }
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => finish(new Error(`无法启动 ${command}: ${error.message}`)));
    child.on("close", (code) => {
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (timedOut) {
        finish(new Error(`${command} 处理超时`));
        return;
      }
      if (code !== 0) {
        finish(new Error(`${command} 处理失败（${code ?? "unknown"}）：${err.slice(-240)}`));
        return;
      }
      finish(undefined, { stdout: out, stderr: err });
    });
  });
}

function parseFrameRate(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const [numerator, denominator] = raw.split("/").map(Number);
  const fps = denominator ? numerator / denominator : numerator;
  return Number.isFinite(fps) && fps > 0 ? fps : undefined;
}

async function probeVideo(
  config: MediaWorkerConfig,
  sourcePath: string,
): Promise<VideoSourceInfo> {
  const result = await runCommand(
    config.ffprobePath,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type,width,height,r_frame_rate",
      "-of",
      "json",
      sourcePath,
    ],
    config.commandTimeoutMs,
  );
  let parsed: ProbeDocument;
  try {
    parsed = JSON.parse(result.stdout) as ProbeDocument;
  } catch {
    throw new Error("ffprobe 返回了无效的视频信息");
  }
  const durationSeconds = Number(parsed.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("无法读取视频时长");
  }
  const video = parsed.streams?.find((stream) => stream.codec_type === "video");
  const hasAudio = parsed.streams?.some((stream) => stream.codec_type === "audio") ?? false;
  return {
    durationMs: Math.round(durationSeconds * 1000),
    ...(video?.width ? { width: video.width } : {}),
    ...(video?.height ? { height: video.height } : {}),
    ...(parseFrameRate(video?.r_frame_rate) ? { fps: parseFrameRate(video?.r_frame_rate) } : {}),
    hasAudio,
  };
}

function sceneStarts(stderr: string, durationSeconds: number, maxScenes: number): number[] {
  const starts = new Set<number>();
  for (const match of stderr.matchAll(/pts_time:([0-9]+(?:\.[0-9]+)?)/g)) {
    const seconds = Number(match[1]);
    if (!Number.isFinite(seconds) || seconds <= 0.25 || seconds >= durationSeconds - 0.25) {
      continue;
    }
    starts.add(Math.round(seconds * 1000) / 1000);
  }
  return [...starts]
    .sort((left, right) => left - right)
    .slice(0, Math.max(0, maxScenes - 1));
}

async function detectSceneStarts(
  config: MediaWorkerConfig,
  sourcePath: string,
  durationSeconds: number,
): Promise<number[]> {
  const filter = `select=gt(scene\\,${config.sceneThreshold}),showinfo`;
  const result = await runCommand(
    config.ffmpegPath,
    [
      "-hide_banner",
      "-nostdin",
      "-i",
      sourcePath,
      "-vf",
      filter,
      "-an",
      "-f",
      "null",
      "-",
    ],
    config.commandTimeoutMs,
  );
  return sceneStarts(result.stderr, durationSeconds, config.maxScenes);
}

function scenePurpose(index: number, count: number): string {
  if (index === 0) return "开场功能（自动按时序推断，待人工复核）";
  if (index === count - 1) return "收束功能（自动按时序推断，待人工复核）";
  return "信息展开（自动按时序推断，待人工复核）";
}

function buildScenes(source: VideoSourceInfo, starts: number[]): VideoAnalysisScene[] {
  const boundaries = [0, ...starts.map((seconds) => Math.round(seconds * 1000)), source.durationMs];
  const scenes: VideoAnalysisScene[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startMs = boundaries[index]!;
    const endMs = boundaries[index + 1]!;
    if (endMs <= startMs) continue;
    scenes.push({
      id: `scene-${index + 1}`,
      startMs,
      endMs,
      purpose: scenePurpose(index, boundaries.length - 1),
      visual: "",
      narration: "",
      screenText: [],
      shot: "",
      edit: "",
      recreation: "保留这一段的内容功能与节奏，替换为原创画面、口播和素材。",
    });
  }
  return scenes.length
    ? scenes
    : [
        {
          id: "scene-1",
          startMs: 0,
          endMs: source.durationMs,
          purpose: "完整视频结构（待人工复核）",
          visual: "",
          narration: "",
          screenText: [],
          shot: "",
          edit: "",
          recreation: "按内容功能重写，不复用原视频的具体表达。",
        },
      ];
}

function buildFallbackAnalysis(
  job: MediaWorkerJob,
  source: VideoSourceInfo,
  starts: number[],
): VideoAnalysisContent {
  const scenes = buildScenes(source, starts);
  const averageSeconds = source.durationMs / 1000 / scenes.length;
  return {
    version: VIDEO_ANALYSIS_SCHEMA_VERSION,
    sourceArtifactId: job.sourceArtifactId,
    jobId: job.id,
    goal: job.goal,
    stage: "ready",
    source,
    summary: {
      hook: `前 ${formatVideoTime(scenes[0]!.endMs)} 为开场段，需结合画面与口播复核钩子。`,
      pacing: `全片 ${formatVideoTime(source.durationMs)}，自动识别 ${scenes.length} 段，平均约 ${averageSeconds.toFixed(1)} 秒/段。`,
      structure: "开场 -> 信息展开 -> 收束（依据时序推断，待补充画面与口播）",
      callToAction: "",
      recreationDirection: "复用内容功能和节奏，不复制原视频的画面、口播、音乐、人物或标识。",
    },
    scenes,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Process exactly one job. The fallback intentionally only reports media facts
 * and time-based structure; transcript and visual fields stay empty until an
 * approved ASR/VLM enrichment adapter is configured.
 */
export async function processMediaJob(
  config: MediaWorkerConfig,
  job: MediaWorkerJob,
): Promise<void> {
  let workDir: string | null = null;
  try {
    await postCallback(config, job, { stage: "probing" });
    await mkdir(config.tempRoot, { recursive: true });
    workDir = await mkdtemp(join(config.tempRoot, "job-"));
    const sourcePath = join(workDir, "source.media");
    await downloadSource(config, job, sourcePath);
    const source = await probeVideo(config, sourcePath);
    if (source.durationMs > config.maxDurationSeconds * 1000) {
      throw new Error(`视频时长超过 ${config.maxDurationSeconds} 秒处理上限`);
    }

    await postCallback(config, job, { stage: "detecting_scenes" });
    const starts = await detectSceneStarts(config, sourcePath, source.durationMs / 1000);

    await postCallback(config, job, { stage: "interpreting" });
    const analysis = buildFallbackAnalysis(job, source, starts);
    await postCallback(config, job, { stage: "ready", analysis });
  } catch (error) {
    try {
      await postCallback(config, job, { stage: "failed", error: shortError(error) });
    } catch (callbackError) {
      throw new Error(`媒体分析失败，且无法回写任务状态：${shortError(callbackError)}`);
    }
  } finally {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {
        // The OS temp directory can remove a job path concurrently.
      });
    }
  }
}
