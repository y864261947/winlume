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
  const workerToken = env.WINLUME_MEDIA_WORKER_TOKEN?.trim();
  if (!workerToken) throw new Error("WINLUME_MEDIA_WORKER_TOKEN is required");

  return {
    host: env.WINLUME_MEDIA_WORKER_HOST?.trim() || "127.0.0.1",
    port: positiveInteger(env.WINLUME_MEDIA_WORKER_PORT, 4020),
    workerToken,
    studioUrl: absoluteHttpUrl(env.WINLUME_MEDIA_APP_URL, "WINLUME_MEDIA_APP_URL"),
    tempRoot: env.WINLUME_MEDIA_TEMP_DIR?.trim() || join(tmpdir(), "winlume-media-worker"),
    ffprobePath: env.WINLUME_FFPROBE_PATH?.trim() || "ffprobe",
    ffmpegPath: env.WINLUME_FFMPEG_PATH?.trim() || "ffmpeg",
    maxSourceBytes: positiveInteger(
      env.WINLUME_MEDIA_MAX_SOURCE_BYTES,
      MAX_REFERENCE_VIDEO_BYTES,
    ),
    maxDurationSeconds: positiveInteger(env.WINLUME_MEDIA_MAX_DURATION_SECONDS, 600),
    sceneThreshold: boundedNumber(
      env.WINLUME_MEDIA_SCENE_THRESHOLD,
      0.35,
      0.01,
      0.99,
    ),
    maxScenes: Math.min(120, positiveInteger(env.WINLUME_MEDIA_MAX_SCENES, 30)),
    commandTimeoutMs: positiveInteger(
      env.WINLUME_MEDIA_COMMAND_TIMEOUT_MS,
      120_000,
    ),
    concurrency: Math.min(4, positiveInteger(env.WINLUME_MEDIA_CONCURRENCY, 1)),
  };
}
