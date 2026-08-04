import type { AgentSseEvent, WorkflowExecutionContext } from "@/lib/agent/types";
import type { ArtifactStore, ProjectStore, SessionStore } from "@/lib/host/ports";

export type AgentExecutionMode = "studio" | "ai-sdk" | "codex";
export type SkillSelectionMode = "merge" | "replace";

/** Known side-effecting item classes exposed by the Codex SDK stream. */
export const CODEX_EXECUTION_TOOL_NAMES = [
  "codex_command",
  "codex_file_change",
  // WinLume launches Codex with MCP disabled. Keep this sentinel in the
  // preflight set so a future explicit MCP integration cannot bypass policy.
  "codex_mcp:*",
] as const;

/**
 * Whether an executor can be invoked again after a worker failure without
 * duplicating user-visible side effects. Agent runtimes default to at-most-once
 * because they may have already persisted messages or executed tools before a
 * transport error reaches the coordinator.
 */
export type AgentExecutionRetrySafety = "at-most-once" | "safe";

export interface AgentExecutionInput {
  userId: string;
  sessionId: string;
  userText: string;
  projectId?: string;
  /** Durable run identity used for correlation and event persistence. */
  runId?: string;
  /** Server-resolved output contract for one professional Workflow Stage. */
  workflow?: WorkflowExecutionContext;
  model?: string;
  skillIds?: string[];
  skillSelectionMode?: SkillSelectionMode;
  allowedToolNames?: string[];
  referencedArtifactIds?: string[];
  referencedArtifactId?: string;
  sessions: SessionStore;
  projects?: ProjectStore;
  artifacts: ArtifactStore;
  signal?: AbortSignal;
  gatewayUserId?: string;
}

export interface AgentExecutor {
  readonly mode: AgentExecutionMode;
  /** Omit only for legacy executors; the coordinator treats that as at-most-once. */
  readonly retrySafety?: AgentExecutionRetrySafety;
  execute(input: AgentExecutionInput): AsyncGenerator<AgentSseEvent, void, undefined>;
}
