import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_REFERENCE_VIDEO_BYTES } from "../../../src/lib/studio/video-upload";

export type MediaWorkerConfig = {
  host: string;
  port: number;
  workerToken: string;
  studioUrl: string;
  tempRoot: string;
  ffprobePath: string;
  ffmpegPath: string;
  maxSourceBytes: number;
  maxDurationSeconds: number;
  sceneThreshold: number;
  maxScenes: number;
  commandTimeoutMs: number;
  concurrency: number;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedNumber(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

function absoluteHttpUrl(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use http or https`);
  }
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function readMediaWorkerConfig(
  env: NodeJS.ProcessEnv = process.env,
): MediaWorkerConfig {
  const workerToken = env.REIZO_MEDIA_WORKER_TOKEN?.trim();
  if (!workerToken) throw new Error("REIZO_MEDIA_WORKER_TOKEN is required");

  return {
    host: env.REIZO_MEDIA_WORKER_HOST?.trim() || "127.0.0.1",
    port: positiveInteger(env.REIZO_MEDIA_WORKER_PORT, 4020),
    workerToken,
    studioUrl: absoluteHttpUrl(env.REIZO_MEDIA_APP_URL, "REIZO_MEDIA_APP_URL"),
    tempRoot: env.REIZO_MEDIA_TEMP_DIR?.trim() || join(tmpdir(), "reizo-media-worker"),
    ffprobePath: env.REIZO_FFPROBE_PATH?.trim() || "ffprobe",
    ffmpegPath: env.REIZO_FFMPEG_PATH?.trim() || "ffmpeg",
    maxSourceBytes: positiveInteger(
      env.REIZO_MEDIA_MAX_SOURCE_BYTES,
      MAX_REFERENCE_VIDEO_BYTES,
    ),
    maxDurationSeconds: positiveInteger(env.REIZO_MEDIA_MAX_DURATION_SECONDS, 600),
    sceneThreshold: boundedNumber(
      env.REIZO_MEDIA_SCENE_THRESHOLD,
      0.35,
      0.01,
      0.99,
    ),
    maxScenes: Math.min(120, positiveInteger(env.REIZO_MEDIA_MAX_SCENES, 30)),
    commandTimeoutMs: positiveInteger(
      env.REIZO_MEDIA_COMMAND_TIMEOUT_MS,
      120_000,
    ),
    concurrency: Math.min(4, positiveInteger(env.REIZO_MEDIA_CONCURRENCY, 1)),
  };
}
