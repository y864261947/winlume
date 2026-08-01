import type { AgentExecutionMode } from "@/lib/agent/executor/types";
import { canTransitionRun } from "./types";
import type { JsonObject, RunStatus } from "./types";

export type ToolApprovalMode = "never" | "on-request" | "always";

export interface RunPolicyInput {
  userId: string;
  projectId?: string;
  organizationId?: string;
  executionMode: AgentExecutionMode;
  model?: string;
  message: string;
  requestedToolNames?: readonly string[];
  metadata?: JsonObject;
}

export interface RunBudgetLimits {
  maxDurationMs: number;
  maxInputChars: number;
  maxToolCalls: number;
  maxOutputTokens?: number;
  maxCostUsd?: number;
  maxAttempts: number;
}

export interface RunBudgetUsage {
  durationMs: number;
  inputChars: number;
  toolCalls: number;
  outputTokens: number;
  costUsd: number;
  attempts: number;
}

export type RunBudgetDelta = Partial<RunBudgetUsage>;

export interface RunPolicyDecision {
  allowed: boolean;
  code?:
    | "missing_user"
    | "mode_not_allowed"
    | "model_not_allowed"
    | "input_too_large"
    | "tool_not_allowed"
    | "tool_approval_required"
    | "user_not_allowed"
    | "run_limit_reached";
  reason?: string;
  limits: RunBudgetLimits;
  approvalRequiredTools: string[];
}

export interface RunPolicy {
  evaluate(input: RunPolicyInput): RunPolicyDecision;
  assertAllowed(input: RunPolicyInput): RunPolicyDecision;
  canTransition?(from: RunStatus, to: RunStatus): boolean;
}

export interface StaticRunPolicyConfig {
  /** Defaults to studio and ai-sdk; Codex must be explicitly enabled. */
  allowedExecutionModes?: readonly AgentExecutionMode[];
  /** Omit to allow the model selected by the configured gateway. */
  allowedModels?: readonly string[];
  /** Tool names that require an approval event before execution. */
  approvalRequiredTools?: readonly string[];
  /** Tool names that are denied regardless of approval. */
  deniedTools?: readonly string[];
  /** Optional single-tenant guard for the current global Codex workspace. */
  codexTrustedUserId?: string;
  toolApprovalMode?: ToolApprovalMode;
  limits?: Partial<RunBudgetLimits>;
}

const DEFAULT_LIMITS: RunBudgetLimits = {
  maxDurationMs: 10 * 60 * 1000,
  maxInputChars: 100_000,
  maxToolCalls: 64,
  maxAttempts: 3,
};

/** Error raised when a run fails policy before entering a worker. */
export class RunPolicyError extends Error {
  readonly code: NonNullable<RunPolicyDecision["code"]>;
  readonly decision: RunPolicyDecision;

  constructor(decision: RunPolicyDecision) {
    super(decision.reason ?? "Run rejected by policy");
    this.name = "RunPolicyError";
    this.code = decision.code ?? "run_limit_reached";
    this.decision = decision;
  }
}

export class RunBudgetExceededError extends Error {
  readonly metric: keyof RunBudgetUsage;
  readonly usage: RunBudgetUsage;
  readonly limits: RunBudgetLimits;

  constructor(
    metric: keyof RunBudgetUsage,
    usage: RunBudgetUsage,
    limits: RunBudgetLimits,
  ) {
    super(`Run budget exceeded: ${metric}`);
    this.name = "RunBudgetExceededError";
    this.metric = metric;
    this.usage = { ...usage };
    this.limits = { ...limits };
  }
}

/**
 * Mutable per-run ledger. Persist its snapshot alongside a run when workers
 * need crash recovery; this class itself deliberately has no storage policy.
 */
export class RunBudgetTracker {
  readonly limits: RunBudgetLimits;
  private current: RunBudgetUsage;

  constructor(limits: RunBudgetLimits, initial?: Partial<RunBudgetUsage>) {
    validateLimits(limits);
    validateUsageDelta(initial ?? {});
    this.limits = { ...limits };
    this.current = {
      durationMs: 0,
      inputChars: 0,
      toolCalls: 0,
      outputTokens: 0,
      costUsd: 0,
      attempts: 0,
      ...(initial ?? {}),
    };
    this.assertWithin();
  }

  get usage(): RunBudgetUsage {
    return { ...this.current };
  }

  consume(delta: RunBudgetDelta): RunBudgetUsage {
    const next: RunBudgetUsage = {
      durationMs: this.current.durationMs + (delta.durationMs ?? 0),
      inputChars: this.current.inputChars + (delta.inputChars ?? 0),
      toolCalls: this.current.toolCalls + (delta.toolCalls ?? 0),
      outputTokens: this.current.outputTokens + (delta.outputTokens ?? 0),
      costUsd: this.current.costUsd + (delta.costUsd ?? 0),
      attempts: this.current.attempts + (delta.attempts ?? 0),
    };
    validateUsageDelta(delta);
    this.assertWithin(next);
    this.current = next;
    return this.usage;
  }

  remaining(): RunBudgetUsage {
    return {
      durationMs: Math.max(0, this.limits.maxDurationMs - this.current.durationMs),
      inputChars: Math.max(0, this.limits.maxInputChars - this.current.inputChars),
      toolCalls: Math.max(0, this.limits.maxToolCalls - this.current.toolCalls),
      outputTokens:
        this.limits.maxOutputTokens === undefined
          ? Number.POSITIVE_INFINITY
          : Math.max(0, this.limits.maxOutputTokens - this.current.outputTokens),
      costUsd:
        this.limits.maxCostUsd === undefined
          ? Number.POSITIVE_INFINITY
          : Math.max(0, this.limits.maxCostUsd - this.current.costUsd),
      attempts: Math.max(0, this.limits.maxAttempts - this.current.attempts),
    };
  }

  private assertWithin(usage = this.current): void {
    const checks: Array<[keyof RunBudgetUsage, number | undefined]> = [
      ["durationMs", this.limits.maxDurationMs],
      ["inputChars", this.limits.maxInputChars],
      ["toolCalls", this.limits.maxToolCalls],
      ["outputTokens", this.limits.maxOutputTokens],
      ["costUsd", this.limits.maxCostUsd],
      ["attempts", this.limits.maxAttempts],
    ];
    for (const [metric, limit] of checks) {
      if (limit !== undefined && usage[metric] > limit) {
        throw new RunBudgetExceededError(metric, usage, this.limits);
      }
    }
  }
}

export class StaticRunPolicy implements RunPolicy {
  private readonly modes: ReadonlySet<AgentExecutionMode>;
  private readonly models: ReadonlySet<string> | null;
  private readonly approvalRequiredTools: ReadonlySet<string>;
  private readonly deniedTools: ReadonlySet<string>;
  private readonly codexTrustedUserId: string | null;
  private readonly toolApprovalMode: ToolApprovalMode;
  private readonly limits: RunBudgetLimits;

  constructor(config: StaticRunPolicyConfig = {}) {
    this.modes = new Set(config.allowedExecutionModes ?? ["studio", "ai-sdk"]);
    this.models = config.allowedModels ? new Set(config.allowedModels) : null;
    this.approvalRequiredTools = new Set(config.approvalRequiredTools ?? []);
    this.deniedTools = new Set(config.deniedTools ?? []);
    this.codexTrustedUserId = config.codexTrustedUserId?.trim() || null;
    this.toolApprovalMode = config.toolApprovalMode ?? "on-request";
    this.limits = {
      ...DEFAULT_LIMITS,
      ...(config.limits ?? {}),
    };
    validateLimits(this.limits);
  }

  evaluate(input: RunPolicyInput): RunPolicyDecision {
    const approvalRequiredTools = this.getApprovalRequiredTools(input);
    const base = {
      limits: { ...this.limits },
      approvalRequiredTools,
    };
    if (!input.userId.trim()) {
      return {
        ...base,
        allowed: false,
        code: "missing_user",
        reason: "A user identity is required to create a run",
      };
    }
    if (!this.modes.has(input.executionMode)) {
      return {
        ...base,
        allowed: false,
        code: "mode_not_allowed",
        reason: `Execution mode is not enabled: ${input.executionMode}`,
      };
    }
    if (
      input.executionMode === "codex" &&
      this.codexTrustedUserId !== null &&
      input.userId !== this.codexTrustedUserId
    ) {
      return {
        ...base,
        allowed: false,
        code: "user_not_allowed",
        reason: "This user is not allowed to use the Codex workspace",
      };
    }
    if (this.models && (!input.model || !this.models.has(input.model))) {
      return {
        ...base,
        allowed: false,
        code: "model_not_allowed",
        reason: `Model is not enabled: ${input.model ?? "(unspecified)"}`,
      };
    }
    if (input.message.length > this.limits.maxInputChars) {
      return {
        ...base,
        allowed: false,
        code: "input_too_large",
        reason: `Input exceeds the ${this.limits.maxInputChars}-character limit`,
      };
    }
    const denied = (input.requestedToolNames ?? []).find((name) =>
      this.deniedTools.has(name),
    );
    if (denied) {
      return {
        ...base,
        allowed: false,
        code: "tool_not_allowed",
        reason: `Tool is denied by policy: ${denied}`,
      };
    }
    return { ...base, allowed: true };
  }

  assertAllowed(input: RunPolicyInput): RunPolicyDecision {
    const decision = this.evaluate(input);
    if (!decision.allowed) throw new RunPolicyError(decision);
    return decision;
  }

  canTransition(from: RunStatus, to: RunStatus): boolean {
    return canTransitionRun(from, to);
  }

  private getApprovalRequiredTools(input: RunPolicyInput): string[] {
    if (this.toolApprovalMode === "never") return [];
    const requested = input.requestedToolNames ?? [];
    return requested.filter(
      (name) =>
        this.toolApprovalMode === "always" || this.approvalRequiredTools.has(name),
    );
  }
}

function validateLimits(limits: RunBudgetLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Policy limit ${name} must be a non-negative number`);
    }
  }
  if (limits.maxAttempts < 1) throw new Error("maxAttempts must be positive");
}

function validateUsageDelta(delta: RunBudgetDelta): void {
  for (const [name, value] of Object.entries(delta)) {
    if (value === undefined || !Number.isFinite(value) || value < 0) {
      throw new Error(`Budget delta ${name} must be a non-negative number`);
    }
  }
}

export function createStaticRunPolicy(
  config: StaticRunPolicyConfig = {},
): RunPolicy {
  return new StaticRunPolicy(config);
}
