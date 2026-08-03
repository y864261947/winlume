import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type { VideoAnalysisJob, VideoAnalysisStage } from "@/lib/studio/video-analysis";

export interface VideoJobStore {
  create(job: VideoAnalysisJob): Promise<VideoAnalysisJob>;
  get(jobId: string): Promise<VideoAnalysisJob | null>;
  update(
    jobId: string,
    patch: Partial<Pick<VideoAnalysisJob, "stage" | "error" | "updatedAt">>,
  ): Promise<VideoAnalysisJob>;
}

type PersistedVideoJobs = {
  version: 1;
  jobs: Record<string, VideoAnalysisJob>;
};

function emptyState(): PersistedVideoJobs {
  return { version: 1, jobs: {} };
}

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

function readState(path: string): PersistedVideoJobs {
  if (!existsSync(path)) return emptyState();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<PersistedVideoJobs>;
    if (raw.version !== 1 || !raw.jobs || typeof raw.jobs !== "object") return emptyState();
    return { version: 1, jobs: raw.jobs as Record<string, VideoAnalysisJob> };
  } catch {
    return emptyState();
  }
}

function writeState(path: string, state: PersistedVideoJobs): void {
  ensureDir(dirname(path));
  const temporary = join(dirname(path), `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    renameSync(temporary, path);
  } catch (error) {
    try {
      if (existsSync(temporary)) unlinkSync(temporary);
    } catch {
      // Preserve the original persistence failure.
    }
    throw error;
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createVideoJobStore(rootDir: string): VideoJobStore {
  const path = join(rootDir, "video-jobs.json");
  return {
    async create(job) {
      const state = readState(path);
      if (state.jobs[job.id]) throw new Error(`Video job already exists: ${job.id}`);
      state.jobs[job.id] = clone(job);
      writeState(path, state);
      return clone(state.jobs[job.id]!);
    },
    async get(jobId) {
      const job = readState(path).jobs[jobId];
      return job ? clone(job) : null;
    },
    async update(jobId, patch) {
      const state = readState(path);
      const current = state.jobs[jobId];
      if (!current) throw new Error(`Video job not found: ${jobId}`);
      const next: VideoAnalysisJob = {
        ...current,
        ...(patch.stage !== undefined ? { stage: patch.stage } : {}),
        ...(patch.error === undefined
          ? {}
          : patch.error
            ? { error: patch.error }
            : {}),
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      };
      if (patch.error === "") delete next.error;
      state.jobs[jobId] = next;
      writeState(path, state);
      return clone(next);
    },
  };
}

export function canTransitionVideoJob(
  from: VideoAnalysisStage,
  to: VideoAnalysisStage,
): boolean {
  if (from === "failed" || from === "ready") return false;
  if (from === to) return true;
  if (to === "failed") return true;
  const order: VideoAnalysisStage[] = [
    "queued",
    "probing",
    "detecting_scenes",
    "transcribing",
    "interpreting",
    "ready",
  ];
  return order.indexOf(to) >= order.indexOf(from);
}
