import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import type {
  EcommerceImageSetJob,
  ToolJob,
  ToolJobStore,
} from "@/lib/studio/tool-jobs";

type PersistedToolJobs = {
  version: 1;
  jobs: Record<string, ToolJob>;
};

function emptyState(): PersistedToolJobs {
  return { version: 1, jobs: {} };
}

function readState(path: string): PersistedToolJobs {
  if (!existsSync(path)) return emptyState();
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<PersistedToolJobs>;
    if (raw.version !== 1 || !raw.jobs || typeof raw.jobs !== "object") return emptyState();
    return { version: 1, jobs: raw.jobs as Record<string, ToolJob> };
  } catch {
    return emptyState();
  }
}

function writeState(path: string, state: PersistedToolJobs): void {
  mkdirSync(dirname(path), { recursive: true });
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

/** File-backed ToolJob store. The interface allows a database-backed adapter later. */
export function createToolJobStore(rootDir: string): ToolJobStore {
  const path = join(rootDir, "tool-jobs.json");
  return {
    async create(job) {
      const state = readState(path);
      if (state.jobs[job.id]) throw new Error(`Tool job already exists: ${job.id}`);
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
      if (!current || current.toolId !== "ecommerce-image-set") {
        throw new Error(`Tool job not found: ${jobId}`);
      }
      const next: EcommerceImageSetJob = {
        ...current,
        ...patch,
        updatedAt: patch.updatedAt ?? new Date().toISOString(),
      };
      if (patch.error === "") delete next.error;
      state.jobs[jobId] = next;
      writeState(path, state);
      return clone(next);
    },
  };
}
