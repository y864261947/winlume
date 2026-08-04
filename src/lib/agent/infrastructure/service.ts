import { randomUUID } from "node:crypto";
import path from "node:path";
import type { AgentExecutionMode } from "@/lib/agent/executor/types";
import { webStore } from "@/lib/host/web/store-singleton";
import { getProductionPack } from "@/lib/agent/production-packs/registry";
import { resolveProductionPackAvailability } from "@/lib/agent/production-packs/availability";
import {
  resolveWorkflowAllowedTools,
  selectedWorkflowModel,
} from "@/lib/agent/production-packs/execution-policy";
import {
  ProductionWorkflowExecution,
  type AuthenticatedProductionWorkflowCommand,
  type ProductionWorkflowCommandResult,
  type ProductionWorkflowProjection,
} from "@/lib/agent/production-packs/workflow-execution";
import { loadCapabilityCatalog } from "@/lib/studio/capabilities.server";
import { RunCoordinator } from "./coordinator";
import type { StaticRunPolicyConfig, ToolApprovalMode } from "./policy";
import { createStaticRunPolicy } from "./policy";
import { createInProcessRunQueue } from "./queue";
import { createFileRunStore } from "./run-store";
import type { AgentRun, RunQueue, RunStore } from "./types";

const DEFAULT_MODES: AgentExecutionMode[] = ["studio", "ai-sdk"];

export interface AgentRunService {
  readonly coordinator: RunCoordinator;
  start(): void;
  cancelSession(userId: string, sessionId: string): Promise<AgentRun | null>;
  findActiveSessionRun(userId: string, sessionId: string): Promise<AgentRun | null>;
  getWorkflowProjection(
    userId: string,
    sessionId: string,
  ): Promise<ProductionWorkflowProjection>;
  executeWorkflowCommand(
    command: AuthenticatedProductionWorkflowCommand,
  ): Promise<ProductionWorkflowCommandResult>;
}

class LocalAgentRunService implements AgentRunService {
  readonly coordinator: RunCoordinator;
  private readonly queue: RunQueue;
  private readonly store: RunStore;
  private readonly productionWorkflow: ProductionWorkflowExecution;
  private readonly workerId = `web-${process.pid}-${randomUUID()}`;
  private readonly workerController = new AbortController();
  private workerPromise: Promise<void> | null = null;

  constructor() {
    const root = process.env.WINLUME_DATA_DIR ?? path.join(process.cwd(), "data");
    this.store = createFileRunStore(path.join(root, "runs"));
    this.queue = createInProcessRunQueue();
    this.productionWorkflow = new ProductionWorkflowExecution({
      runs: this.store,
      sessions: webStore.sessions,
      artifacts: webStore.artifacts,
      getPack: getProductionPack,
      submitRun: async (input) => {
        const submitted = await this.coordinator.submit(input);
        return { run: submitted.run, created: submitted.created };
      },
      resolveStageExecution: async (pack, stage) => {
        const catalog = await loadCapabilityCatalog();
        const availability = resolveProductionPackAvailability(pack, catalog);
        if (!availability.available) {
          throw new Error("Pack requirements are unavailable");
        }
        const allowedTools = await resolveWorkflowAllowedTools(pack, stage, catalog);
        if (!allowedTools) throw new Error("Pack execution policy is unavailable");
        return {
          model: selectedWorkflowModel(catalog),
          allowedTools,
        };
      },
    });
    this.coordinator = new RunCoordinator({
      store: this.store,
      queue: this.queue,
      sessions: webStore.sessions,
      projects: webStore.projects,
      artifacts: webStore.artifacts,
      productionWorkflow: this.productionWorkflow,
      policy: createStaticRunPolicy(policyFromEnvironment()),
      leaseTtlMs: readPositiveInteger("WINLUME_RUN_LEASE_MS", 30_000),
      retryDelayMs: (attempt) => Math.min(30_000, 500 * 2 ** Math.max(0, attempt - 1)),
    });
  }

  start(): void {
    if (this.workerPromise) return;
    this.workerPromise = this.recoverAndRun()
      .catch(() => {
        // The durable run record remains queued/running for recovery on the
        // next submission or process start. HTTP handlers must stay available.
      })
      .finally(() => {
        this.workerPromise = null;
      });
  }

  async findActiveSessionRun(
    userId: string,
    sessionId: string,
  ): Promise<AgentRun | null> {
    const runs = await this.store.listRuns({
      userId,
      sessionId,
      statuses: ["queued", "running", "waiting_approval"],
      limit: 1,
    });
    return runs[0] ?? null;
  }

  async cancelSession(userId: string, sessionId: string): Promise<AgentRun | null> {
    const run = await this.findActiveSessionRun(userId, sessionId);
    if (!run) return null;
    return this.coordinator.cancel(run.id, userId);
  }

  getWorkflowProjection(
    userId: string,
    sessionId: string,
  ): Promise<ProductionWorkflowProjection> {
    return this.productionWorkflow.getProjection(userId, sessionId);
  }

  async executeWorkflowCommand(
    command: AuthenticatedProductionWorkflowCommand,
  ): Promise<ProductionWorkflowCommandResult> {
    const result = await this.productionWorkflow.executeCommand(command);
    if (result.created) this.start();
    return result;
  }

  private async recoverAndRun(): Promise<void> {
    const maxAttempts = readPositiveInteger("WINLUME_RUN_MAX_ATTEMPTS", 3);
    await recoverLocalRunQueue({
      store: this.store,
      queue: this.queue,
      maxAttempts,
      workflowFinalizer: this.productionWorkflow,
    });
    await this.coordinator.runWorker({
      workerId: this.workerId,
      signal: this.workerController.signal,
    });
  }
}

export interface RecoverLocalRunQueueOptions {
  store: RunStore;
  queue: RunQueue;
  maxAttempts: number;
  workflowFinalizer?: Pick<ProductionWorkflowExecution, "completeRun">;
}

/**
 * Rebuild a process-local queue after this web process starts.
 *
 * A prior process may have died after an executor persisted a message or
 * changed a file. Its in-memory queue lease is gone, so replaying its running
 * turn would violate at-most-once execution. Mark it terminal instead; callers
 * can submit a deliberate retry. Queued runs have not started and are safe to
 * enqueue again.
 */
export async function recoverLocalRunQueue({
  store,
  queue,
  maxAttempts,
  workflowFinalizer,
}: RecoverLocalRunQueueOptions): Promise<void> {
  const candidates = await store.listRuns({ statuses: ["queued", "running"] });
  for (const run of candidates) {
    if (run.status === "running") {
      if (run.metadata?.production && workflowFinalizer) {
        const events = await store.listEvents(run.id);
        const completed = events.some(
          (event) =>
            event.type === "agent.event" &&
            event.payload.event.type === "done" &&
            event.payload.event.reason === "completed",
        );
        if (completed) {
          await workflowFinalizer.completeRun(run.id);
          continue;
        }
      }
      await store.transitionRun(run.id, "failed", {
        reason: "Worker process stopped before the run completed",
        error: {
          code: "worker_interrupted",
          message: "Worker process stopped before the run completed",
          retryable: false,
        },
      });
      continue;
    }
    await queue.enqueue({
      runId: run.id,
      idempotencyKey: `run:${run.id}`,
      maxAttempts,
    });
  }
}

function parseExecutionModes(value: string | undefined): AgentExecutionMode[] {
  if (!value?.trim()) return DEFAULT_MODES;
  const requested = value
    .split(",")
    .map((mode) => mode.trim())
    .filter(
      (mode): mode is AgentExecutionMode =>
        mode === "studio" || mode === "ai-sdk" || mode === "codex",
    );
  if (!requested.length) return DEFAULT_MODES;
  return [...new Set(requested)].filter(
    (mode) => mode !== "codex" || process.env.WINLUME_CODEX_ENABLED === "true",
  );
}

function parseList(value: string | undefined): string[] | undefined {
  const values = value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values?.length ? [...new Set(values)] : undefined;
}

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readNonNegativeNumber(name: string): number | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function parseApprovalMode(value: string | undefined): ToolApprovalMode | undefined {
  if (value === "never" || value === "on-request" || value === "always") {
    return value;
  }
  return undefined;
}

function policyFromEnvironment(): StaticRunPolicyConfig {
  const approvalMode = parseApprovalMode(
    process.env.WINLUME_RUN_TOOL_APPROVAL?.trim(),
  );
  const maxOutputTokens = readNonNegativeNumber("WINLUME_RUN_MAX_OUTPUT_TOKENS");
  const maxCostUsd = readNonNegativeNumber("WINLUME_RUN_MAX_COST_USD");
  return {
    allowedExecutionModes: parseExecutionModes(
      process.env.WINLUME_RUN_ALLOWED_EXECUTION_MODES,
    ),
    allowedModels: parseList(process.env.WINLUME_RUN_ALLOWED_MODELS),
    deniedTools: parseList(process.env.WINLUME_RUN_DENIED_TOOLS),
    approvalRequiredTools: parseList(
      process.env.WINLUME_RUN_APPROVAL_REQUIRED_TOOLS,
    ),
    // Codex currently has one server-configured workspace. Never allow it to
    // become a shared multi-user workspace before account/project isolation is
    // implemented. An empty value intentionally rejects every Codex request.
    codexTrustedUserId: process.env.WINLUME_CODEX_TRUSTED_USER_ID?.trim() || "__none__",
    ...(approvalMode ? { toolApprovalMode: approvalMode } : {}),
    limits: {
      maxDurationMs: readPositiveInteger("WINLUME_RUN_MAX_DURATION_MS", 600_000),
      maxInputChars: readPositiveInteger("WINLUME_RUN_MAX_INPUT_CHARS", 100_000),
      maxToolCalls: readPositiveInteger("WINLUME_RUN_MAX_TOOL_CALLS", 64),
      maxAttempts: readPositiveInteger("WINLUME_RUN_MAX_ATTEMPTS", 3),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      ...(maxCostUsd !== undefined ? { maxCostUsd } : {}),
    },
  };
}

const globalForAgentRuns = globalThis as typeof globalThis & {
  __winlumeAgentRunService?: AgentRunService;
};

/**
 * Server-only singleton for the development/single-node adapters. Production
 * can replace this factory with a Postgres RunStore and Redis/BullMQ queue
 * while keeping the route and executor contracts unchanged.
 */
export function getAgentRunService(): AgentRunService {
  if (!globalForAgentRuns.__winlumeAgentRunService) {
    globalForAgentRuns.__winlumeAgentRunService = new LocalAgentRunService();
  }
  return globalForAgentRuns.__winlumeAgentRunService;
}
