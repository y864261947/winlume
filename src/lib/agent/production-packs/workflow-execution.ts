import { RunStoreError } from "@/lib/agent/infrastructure/types";
import type {
  AgentRun,
  CreateRunInput,
  JsonObject,
  RunCreateResult,
  RunStore,
} from "@/lib/agent/infrastructure/types";
import type { WorkflowExecutionContext } from "@/lib/agent/types";
import type { ArtifactStore, SessionStore } from "@/lib/host/ports";
import {
  toProductionPackMeta,
  type ProductionPack,
  type ProductionStage,
} from "./contracts";
import type {
  ProductionWorkflowArtifactRef,
  ProductionWorkflowAction,
  ProductionWorkflowCommand as PublicProductionWorkflowCommand,
  ProductionWorkflowProjection,
  ProductionWorkflowStageStatus,
} from "./workflow-contract";
import { parseWorkflowSessionBinding } from "./session-binding";
import {
  approveProductionStage,
  failProductionStage,
  parseProductionRunMetadata,
  prepareNextProductionStage,
  prepareProductionRetry,
  prepareProductionRevision,
  recordProductionStageResult,
  recordProductionStageStartDecision,
  requestProductionChanges,
  serializeProductionRunMetadata,
  type ProductionRunMetadata,
} from "./run-metadata";

export interface ProductionWorkflowExecutionOptions {
  runs: RunStore;
  sessions: SessionStore;
  artifacts: ArtifactStore;
  getPack: (id: string) => Promise<ProductionPack | null>;
  submitRun?: (input: CreateRunInput) => Promise<RunCreateResult>;
  resolveStageExecution?: (
    pack: ProductionPack,
    stage: ProductionStage,
  ) => Promise<{ model: string; allowedTools: string[] }>;
}

interface ProductionWorkflowCommandBase {
  userId: string;
  sessionId: string;
  runId: string;
  idempotencyKey: string;
  occurredAt: string;
}

export type AuthenticatedProductionWorkflowCommand =
  ProductionWorkflowCommandBase & PublicProductionWorkflowCommand;

export interface ProductionWorkflowCommandResult {
  sourceRun: AgentRun;
  startedRun?: AgentRun;
  created: boolean;
}

export type {
  ProductionWorkflowAction,
  ProductionWorkflowProjection,
} from "./workflow-contract";

/**
 * Owns the durable Workflow lifecycle. Callers provide Run identity only; Pack,
 * Stage, Artifact mapping, and transitions are always rebuilt server-side.
 */
export class ProductionWorkflowExecution {
  private readonly runs: RunStore;
  private readonly sessions: SessionStore;
  private readonly artifacts: ArtifactStore;
  private readonly getPack: ProductionWorkflowExecutionOptions["getPack"];
  private readonly submitRun?: ProductionWorkflowExecutionOptions["submitRun"];
  private readonly resolveStageExecution?: ProductionWorkflowExecutionOptions["resolveStageExecution"];

  constructor(options: ProductionWorkflowExecutionOptions) {
    this.runs = options.runs;
    this.sessions = options.sessions;
    this.artifacts = options.artifacts;
    this.getPack = options.getPack;
    this.submitRun = options.submitRun;
    this.resolveStageExecution = options.resolveStageExecution;
  }

  async executionContext(run: AgentRun): Promise<WorkflowExecutionContext | undefined> {
    const rawProduction = run.metadata?.production;
    if (!rawProduction) return undefined;
    const state = parseProductionRunMetadata(rawProduction);
    const { stage } = await this.resolvePackAndStage(state);
    return {
      workflowId: state.workflowId,
      runId: run.id,
      stageId: stage.id,
      presentation: {
        kind: "workflow_run",
        workflowId: state.workflowId,
        runId: run.id,
        stageId: stage.id,
        stageTitle: stage.title,
        iteration: state.execution.iteration,
        intent:
          state.execution.intent ??
          (state.execution.iteration > 0
            ? "revision_start"
            : "stage_start"),
      },
      outputs: stage.outputs.map((output) => ({
        id: output.id,
        kinds: [...output.kinds],
        required: output.required,
      })),
    };
  }

  async completeRun(runId: string): Promise<AgentRun> {
    const run = await this.runs.getRun(runId);
    if (!run) throw new Error(`Run not found: ${runId}`);
    const state = parseProductionRunMetadata(run.metadata?.production);
    if (run.status === "completed" || run.status === "failed") return run;
    if (run.status !== "running") {
      throw new Error(`Workflow Run cannot complete from status ${run.status}`);
    }
    const { pack, stage } = await this.resolvePackAndStage(state);
    const outputArtifactIds: Record<string, string[]> = {};
    const artifacts = await this.artifacts.listBySession(run.userId, run.sessionId);

    for (const artifact of artifacts) {
      const provenance = artifact.provenance?.workflow;
      if (
        !provenance ||
        provenance.workflowId !== state.workflowId ||
        provenance.runId !== run.id ||
        provenance.stageId !== stage.id
      ) {
        continue;
      }
      if (artifact.projectId !== run.projectId) {
        return this.failRun(
          run,
          "workflow_output_scope_invalid",
          `Workflow output belongs to another Project: ${artifact.id}`,
        );
      }
      if (artifact.status && artifact.status !== "ready") {
        return this.failRun(
          run,
          "workflow_output_not_ready",
          `Workflow output is not ready: ${artifact.id}`,
        );
      }
      const output = stage.outputs.find((candidate) => candidate.id === provenance.outputId);
      if (!output) {
        return this.failRun(
          run,
          "workflow_output_unknown",
          `Unknown Stage output: ${provenance.outputId}`,
        );
      }
      if (!output.kinds.includes(artifact.kind)) {
        return this.failRun(
          run,
          "workflow_output_kind_invalid",
          `Workflow output ${output.id} does not accept Artifact kind ${artifact.kind}`,
        );
      }
      const ids = outputArtifactIds[output.id] ?? [];
      if (!ids.includes(artifact.id)) ids.push(artifact.id);
      outputArtifactIds[output.id] = ids;
    }

    const missing = stage.outputs.find(
      (output) => output.required && !outputArtifactIds[output.id]?.length,
    );
    if (missing) {
      return this.failRun(
        run,
        "workflow_output_missing",
        `Required Stage output is missing: ${missing.id}`,
      );
    }

    return this.transitionProductionRun(
      run,
      "completed",
      (current) =>
        recordProductionStageResult(pack, current, outputArtifactIds).state,
      { reason: "workflow Stage completed" },
    );
  }

  async executeCommand(
    command: AuthenticatedProductionWorkflowCommand,
  ): Promise<ProductionWorkflowCommandResult> {
    const run = await this.runs.getRun(command.runId);
    if (
      !run ||
      run.userId !== command.userId ||
      run.sessionId !== command.sessionId
    ) {
      throw new Error("Workflow Run not found");
    }
    const state = parseProductionRunMetadata(run.metadata?.production);
    const { pack, stage } = await this.resolvePackAndStage(state);
    if (command.action === "retry_stage") {
      if (run.status !== "failed" && run.status !== "cancelled") {
        throw new Error("Workflow retry requires a failed or cancelled Run");
      }
      if (!this.submitRun) {
        throw new Error("Workflow Run submission is unavailable");
      }
      const retry = prepareProductionRetry(pack, state, {
        predecessorRunId: run.id,
      });
      const existingSuccessor = await this.findDirectSuccessor(
        run,
        state.workflowId,
        retry.effect.idempotencyKey,
      );
      if (existingSuccessor) {
        return {
          sourceRun: run,
          startedRun: existingSuccessor,
          created: false,
        };
      }
      const execution = await this.stageExecution(pack, stage, run);
      const retryState = parseProductionRunMetadata({
        ...retry.state,
        execution: {
          ...retry.state.execution,
          allowedTools: execution.allowedTools,
        },
      });
      const submitted = await this.submitRun({
        userId: run.userId,
        sessionId: run.sessionId,
        ...(run.projectId ? { projectId: run.projectId } : {}),
        ...(run.organizationId ? { organizationId: run.organizationId } : {}),
        idempotencyScope: `user:${run.userId}:${retry.effect.idempotencyScope}`,
        idempotencyKey: retry.effect.idempotencyKey,
        input: {
          message: [
            pack.title,
            `重试「${stage.title}」阶段。`,
            `阶段目标：${stage.objective}`,
          ].join("\n\n"),
          executionMode: run.input.executionMode,
          model: execution.model,
          skillIds: retry.effect.skillIds,
          skillSelectionMode: "replace",
          allowedToolNames: execution.allowedTools,
          ...(retry.effect.referencedArtifactIds.length
            ? { referencedArtifactIds: retry.effect.referencedArtifactIds }
            : {}),
        },
        metadata: { production: serializeProductionRunMetadata(retryState) },
      });
      return {
        sourceRun: run,
        startedRun: submitted.run,
        created: submitted.created,
      };
    }
    if (run.status !== "completed") {
      throw new Error("Workflow command requires a completed Run");
    }
    if (command.action === "approve") {
      const sourceRun = await this.updateProductionState(run, (current) =>
        approveProductionStage(pack, current, {
          decisionId: command.idempotencyKey,
          actorId: command.userId,
          occurredAt: command.occurredAt,
          ...(command.note ? { note: command.note } : {}),
        }).state,
      );
      return { sourceRun, created: false };
    }
    if (!this.submitRun) {
      throw new Error("Workflow Run submission is unavailable");
    }

    if (command.action === "start_next") {
      const sourceRun = await this.updateProductionState(run, (current) =>
        recordProductionStageStartDecision(pack, current, {
          decisionId: command.idempotencyKey,
          actorId: command.userId,
          occurredAt: command.occurredAt,
        }).state,
      );
      const sourceState = parseProductionRunMetadata(
        sourceRun.metadata?.production,
      );
      const next = prepareNextProductionStage(pack, sourceState, {
        predecessorRunId: sourceRun.id,
      });
      const nextStage = pack.stages[next.state.execution.stageIndex];
      const execution = await this.stageExecution(pack, nextStage, sourceRun);
      const nextState = parseProductionRunMetadata({
        ...next.state,
        execution: {
          ...next.state.execution,
          allowedTools: execution.allowedTools,
        },
      });
      const submitted = await this.submitRun({
        userId: sourceRun.userId,
        sessionId: sourceRun.sessionId,
        ...(sourceRun.projectId ? { projectId: sourceRun.projectId } : {}),
        ...(sourceRun.organizationId
          ? { organizationId: sourceRun.organizationId }
          : {}),
        idempotencyScope: `user:${sourceRun.userId}:${next.effect.idempotencyScope}`,
        idempotencyKey: next.effect.idempotencyKey,
        input: {
          message: [
            pack.title,
            `开始「${nextStage.title}」阶段。`,
            `阶段目标：${nextStage.objective}`,
          ].join("\n\n"),
          executionMode: sourceRun.input.executionMode,
          model: execution.model,
          skillIds: next.effect.skillIds,
          skillSelectionMode: "replace",
          allowedToolNames: execution.allowedTools,
          ...(next.effect.referencedArtifactIds.length
            ? { referencedArtifactIds: next.effect.referencedArtifactIds }
            : {}),
        },
        metadata: { production: serializeProductionRunMetadata(nextState) },
      });
      return {
        sourceRun,
        startedRun: submitted.run,
        created: submitted.created,
      };
    }

    const sourceRun = await this.updateProductionState(run, (current) =>
      requestProductionChanges(pack, current, {
        decisionId: command.idempotencyKey,
        actorId: command.userId,
        occurredAt: command.occurredAt,
        note: command.note,
      }).state,
    );
    const requestedState = parseProductionRunMetadata(
      sourceRun.metadata?.production,
    );

    const revision = prepareProductionRevision(pack, requestedState, {
      predecessorRunId: sourceRun.id,
    });
    const execution = await this.stageExecution(pack, stage, sourceRun);
    const revisionState = parseProductionRunMetadata({
      ...revision.state,
      execution: {
        ...revision.state.execution,
        allowedTools: execution.allowedTools,
      },
    });
    const submitted = await this.submitRun({
      userId: sourceRun.userId,
      sessionId: sourceRun.sessionId,
      ...(sourceRun.projectId ? { projectId: sourceRun.projectId } : {}),
      ...(sourceRun.organizationId
        ? { organizationId: sourceRun.organizationId }
        : {}),
      idempotencyScope: `user:${sourceRun.userId}:${revision.effect.idempotencyScope}`,
      idempotencyKey: revision.effect.idempotencyKey,
      input: {
        message: [
          pack.title,
          `返工「${stage.title}」阶段。`,
          `修改要求：${command.note}`,
        ].join("\n\n"),
        executionMode: sourceRun.input.executionMode,
        model: execution.model,
        skillIds: revision.effect.skillIds,
        skillSelectionMode: "replace",
        allowedToolNames: execution.allowedTools,
        ...(revision.effect.referencedArtifactIds.length
          ? { referencedArtifactIds: revision.effect.referencedArtifactIds }
          : {}),
      },
      metadata: { production: serializeProductionRunMetadata(revisionState) },
    });
    return {
      sourceRun,
      startedRun: submitted.run,
      created: submitted.created,
    };
  }

  async getProjection(
    userId: string,
    sessionId: string,
  ): Promise<ProductionWorkflowProjection> {
    const session = await this.sessions.getSession(userId, sessionId);
    if (!session?.workflow) throw new Error("Workflow Session not found");
    const binding = parseWorkflowSessionBinding(session.workflow);
    const pack = binding.packSnapshot ?? (await this.getPack(binding.packId));
    if (
      !pack ||
      pack.id !== binding.packId ||
      pack.version !== binding.packVersion
    ) {
      throw new Error("Pack version is unavailable");
    }

    const persistedRuns = await this.runs.listRuns({ userId, sessionId });
    const workflowRuns: Array<{
      run: AgentRun;
      state: ReturnType<typeof parseProductionRunMetadata>;
    }> = [];
    for (const run of persistedRuns) {
      if (!run.metadata?.production) continue;
      const state = parseProductionRunMetadata(run.metadata.production);
      if (state.workflowId !== binding.workflowId) continue;
      if (
        state.pack.id !== binding.packId ||
        state.pack.version !== binding.packVersion
      ) {
        throw new Error("Workflow Run does not match its Session binding");
      }
      workflowRuns.push({ run, state });
    }

    if (!workflowRuns.length) {
      const stage = pack.stages[0];
      const outputs: Record<string, ProductionWorkflowArtifactRef[]> = {};
      return {
        workflowId: binding.workflowId,
        pack: toProductionPackMeta(pack),
        currentStage: { id: stage.id, title: stage.title, index: 0, total: pack.stages.length },
        stages: this.projectStages(pack, {
          currentStageIndex: 0,
          currentStatus: "ready",
          completedStageIds: [],
          outputs,
        }),
        outputs,
        actions: ["start"],
      };
    }

    const predecessors = new Set(
      workflowRuns.flatMap(({ state }) =>
        state.execution.predecessorRunId ? [state.execution.predecessorRunId] : [],
      ),
    );
    const heads = workflowRuns.filter(({ run }) => !predecessors.has(run.id));
    if (heads.length !== 1) throw new Error("Workflow Run history has multiple heads");
    const { run, state } = heads[0];
    const stage = pack.stages[state.execution.stageIndex];
    if (!stage || stage.id !== state.execution.stageId) {
      throw new Error("Production state points to an unavailable Stage");
    }
    if (run.status === "completed" && state.phase === "executing") {
      throw new Error("Workflow Run status does not match production state");
    }

    const outputs: ProductionWorkflowProjection["outputs"] = {};
    for (const [outputId, artifactIds] of Object.entries(state.artifacts.outputs)) {
      const declaredOutput = pack.stages
        .flatMap((candidate) => candidate.outputs)
        .find((output) => output.id === outputId);
      if (!declaredOutput) {
        throw new Error("Workflow output Artifact is unavailable");
      }
      const entries = await Promise.all(
        artifactIds.map((artifactId) => this.artifacts.get(userId, artifactId)),
      );
      outputs[outputId] = entries.map((artifact) => {
        const provenance = artifact?.provenance?.workflow;
        if (
          !artifact ||
          artifact.sessionId !== sessionId ||
          artifact.projectId !== run.projectId ||
          (artifact.status && artifact.status !== "ready") ||
          !declaredOutput.kinds.includes(artifact.kind) ||
          provenance?.workflowId !== binding.workflowId ||
          provenance?.outputId !== outputId
        ) {
          throw new Error("Workflow output Artifact is unavailable");
        }
        return {
          id: artifact.id,
          name: artifact.name,
          kind: artifact.kind,
          ...(artifact.status ? { status: artifact.status } : {}),
        };
      });
    }

    const actions: ProductionWorkflowAction[] = [];
    if (run.status === "queued" || run.status === "running") {
      actions.push("stop");
    } else if (run.status === "failed" || run.status === "cancelled") {
      actions.push("retry_stage");
    } else if (run.status === "completed") {
      if (state.phase === "awaiting_approval") {
        actions.push("approve", "request_changes");
      } else if (state.phase === "ready_for_next") {
        actions.push("start_next");
      } else if (state.phase === "needs_revision") {
        actions.push("request_changes");
      }
    }

    return {
      workflowId: binding.workflowId,
      pack: toProductionPackMeta(pack),
      currentStage: {
        id: stage.id,
        title: stage.title,
        index: state.execution.stageIndex,
        total: pack.stages.length,
      },
      stages: this.projectStages(pack, {
        currentStageIndex: state.execution.stageIndex,
        currentStatus: this.currentStageStatus(run, state.phase),
        completedStageIds: state.completedStageIds,
        outputs,
      }),
      run: {
        id: run.id,
        status: run.status,
        phase: run.status === "failed" ? "failed" : state.phase,
        iteration: state.execution.iteration,
        ...(state.execution.predecessorRunId
          ? { predecessorRunId: state.execution.predecessorRunId }
          : {}),
        ...(run.error
          ? { error: { code: run.error.code, message: run.error.message } }
          : {}),
      },
      outputs,
      ...(state.review ? { review: state.review } : {}),
      actions,
    };
  }

  private failRun(
    run: AgentRun,
    code: string,
    message: string,
  ): Promise<AgentRun> {
    return this.transitionProductionRun(
      run,
      "failed",
      failProductionStage,
      {
      reason: message,
      error: { code, message, retryable: false },
      },
    );
  }

  private async resolvePackAndStage(
    state: ReturnType<typeof parseProductionRunMetadata>,
  ) {
    const pack = state.packSnapshot ?? (await this.getPack(state.pack.id));
    if (
      !pack ||
      pack.id !== state.pack.id ||
      pack.version !== state.pack.version
    ) {
      throw new Error("Pack version is unavailable");
    }
    const stage = pack.stages[state.execution.stageIndex];
    if (!stage || stage.id !== state.execution.stageId) {
      throw new Error("Production state points to an unavailable Stage");
    }
    return { pack, stage };
  }

  private currentStageStatus(
    run: AgentRun,
    phase: ProductionRunMetadata["phase"],
  ): ProductionWorkflowStageStatus {
    if (
      run.status === "queued" ||
      run.status === "running" ||
      run.status === "failed" ||
      run.status === "cancelled"
    ) {
      return run.status;
    }
    if (run.status === "waiting_approval") return "awaiting_approval";
    if (phase === "workflow_completed") return "completed";
    if (
      phase === "awaiting_approval" ||
      phase === "ready_for_next" ||
      phase === "needs_revision" ||
      phase === "failed"
    ) {
      return phase;
    }
    return "running";
  }

  private projectStages(
    pack: ProductionPack,
    input: {
      currentStageIndex: number;
      currentStatus: ProductionWorkflowStageStatus;
      completedStageIds: string[];
      outputs: ProductionWorkflowProjection["outputs"];
    },
  ): ProductionWorkflowProjection["stages"] {
    const completed = new Set(input.completedStageIds);
    return pack.stages.map((stage, index) => ({
      id: stage.id,
      title: stage.title,
      index,
      ...(stage.handoffSummary ? { summary: stage.handoffSummary } : {}),
      status:
        index === input.currentStageIndex
          ? input.currentStatus
          : completed.has(stage.id)
            ? "completed"
            : "upcoming",
      outputs: stage.outputs.map((output) => ({
        id: output.id,
        required: output.required,
        kinds: [...output.kinds],
        artifacts: input.outputs[output.id] ?? [],
      })),
    }));
  }

  private async stageExecution(
    pack: ProductionPack,
    stage: ProductionStage,
    sourceRun: AgentRun,
  ): Promise<{ model: string; allowedTools: string[] }> {
    if (this.resolveStageExecution) return this.resolveStageExecution(pack, stage);
    return {
      model: sourceRun.input.model ?? "gpt-4o-mini",
      allowedTools: [...stage.allowedTools],
    };
  }

  private async findDirectSuccessor(
    run: AgentRun,
    workflowId: string,
    expectedIdempotencyKey: string,
  ): Promise<AgentRun | null> {
    const sessionRuns = await this.runs.listRuns({
      userId: run.userId,
      sessionId: run.sessionId,
    });
    const successors = sessionRuns.filter((candidate) => {
      if (!candidate.metadata?.production) return false;
      const candidateState = parseProductionRunMetadata(
        candidate.metadata.production,
      );
      return (
        candidateState.workflowId === workflowId &&
        candidateState.execution.predecessorRunId === run.id
      );
    });
    if (successors.length > 1) {
      throw new Error("Workflow retry has multiple successor Runs");
    }
    const successor = successors[0];
    if (!successor) return null;
    if (successor.idempotencyKey !== expectedIdempotencyKey) {
      throw new Error("Workflow Run already has a different successor");
    }
    return successor;
  }

  private async updateProductionState(
    initialRun: AgentRun,
    transition: (state: ProductionRunMetadata) => ProductionRunMetadata,
  ): Promise<AgentRun> {
    let run = initialRun;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = parseProductionRunMetadata(run.metadata?.production);
      const next = transition(current);
      if (JSON.stringify(next) === JSON.stringify(current)) return run;

      const metadata: JsonObject = {
        ...(run.metadata ?? {}),
        production: serializeProductionRunMetadata(next),
      };
      try {
        return await this.runs.updateRun(run.id, { metadata }, run.revision);
      } catch (error) {
        if (!(error instanceof RunStoreError) || error.code !== "revision_conflict") {
          throw error;
        }
        const latest = await this.runs.getRun(run.id);
        if (!latest) throw error;
        run = latest;
      }
    }
    throw new Error("Workflow decision could not be applied concurrently");
  }

  private async transitionProductionRun(
    initialRun: AgentRun,
    status: "completed" | "failed",
    transition: (state: ProductionRunMetadata) => ProductionRunMetadata,
    options: {
      reason: string;
      error?: { code: string; message: string; retryable: boolean };
    },
  ): Promise<AgentRun> {
    let run = initialRun;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (run.status !== "running") return run;
      const state = transition(
        parseProductionRunMetadata(run.metadata?.production),
      );
      const metadata: JsonObject = {
        ...(run.metadata ?? {}),
        production: serializeProductionRunMetadata(state),
      };
      try {
        return await this.runs.transitionRun(run.id, status, {
          ...options,
          metadata,
          expectedRevision: run.revision,
        });
      } catch (error) {
        if (!(error instanceof RunStoreError) || error.code !== "revision_conflict") {
          throw error;
        }
        const latest = await this.runs.getRun(run.id);
        if (!latest) throw error;
        run = latest;
      }
    }
    throw new Error("Workflow Run could not be finalized concurrently");
  }
}
