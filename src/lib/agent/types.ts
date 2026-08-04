import type { ProductionPack } from "@/lib/agent/production-packs/contracts";

export type Role = "user" | "assistant" | "system" | "tool";

export type WorkflowIntakeValue = string | number | string[];

export interface SessionWorkflowBinding {
  schemaVersion: 1;
  workflowId: string;
  packId: string;
  packVersion: string;
  /** Immutable server-authored contract used after the registry advances. */
  packSnapshot?: ProductionPack;
  intakeValues: Record<string, WorkflowIntakeValue>;
  inputArtifactIds: string[];
  boundAt: string;
}

export interface Session {
  id: string;
  userId: string;
  title: string;
  model: string;
  /** Optional project scope shared by multiple conversations. */
  projectId?: string;
  /** Skills applied to every turn unless overridden; UI may pin/unpin */
  pinnedSkillIds?: string[];
  /** Validated launch intent for a capability-specific Studio workflow. */
  capabilityPresetId?: string;
  /** Server-validated Workflow Pack selection and intake before execution. */
  workflow?: SessionWorkflowBinding;
  /** Codex SDK thread persisted for coding-specialist continuity. */
  codexThreadId?: string;
  createdAt: string;
  updatedAt: string;
}

/** A durable workspace shared by a user's conversations and agent context. */
export interface Project {
  id: string;
  /** May be omitted from public API responses; ownership is server-side. */
  userId?: string;
  name: string;
  description?: string;
  instructions?: string;
  pinnedSkillIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: string;
  result?: string;
}

export type WorkflowRunIntent =
  | "stage_start"
  | "revision_start"
  | "retry_start";

export interface WorkflowMessagePresentation {
  kind: "workflow_run";
  workflowId: string;
  runId: string;
  stageId: string;
  stageTitle: string;
  iteration: number;
  intent: WorkflowRunIntent;
}

export interface Message {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  /** Public display metadata; canonical content remains model-visible. */
  presentation?: WorkflowMessagePresentation;
  skillIds?: string[];
  toolCalls?: ToolCallRecord[];
  /** For role "tool": links to the assistant tool_call id */
  toolCallId?: string;
  attachmentIds?: string[];
  createdAt: string;
}

export type DefaultArtifactKind = "markdown" | "html" | "image-prompt" | "none";

/** Safe v2 contract metadata exposed with a Skill; prompt bodies remain separate. */
export interface SkillContractMeta {
  schemaVersion: 2;
  version: string;
  stability: "experimental" | "stable";
  requiredCapabilities: string[];
  allowedTools: string[];
  approvalPolicy: "none" | "on-blocking-review" | "required";
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  /** Upstream department folder id (marketing, design, …) */
  category: string;
  triggers?: string[];
  examplePrompt?: string;
  preview?: "markdown" | "html" | "none";
  source: "bundled" | "imported" | "user";
  enabled: boolean;
  featured?: boolean;
  defaultArtifact?: DefaultArtifactKind;
  contract?: SkillContractMeta;
}

export interface Skill extends SkillMeta {
  systemPrompt: string;
}

export type ArtifactKind =
  | "markdown"
  | "html"
  | "text"
  | "json"
  | "image"
  | "video"
  | "video-analysis"
  | "binary"
  | "canvas";

export interface WorkflowArtifactOutputContract {
  id: string;
  kinds: ArtifactKind[];
  required: boolean;
}

/** Server-resolved Stage context available only during one Workflow Run. */
export interface WorkflowExecutionContext {
  workflowId: string;
  runId: string;
  stageId: string;
  /** Present for server-authored Workflow turns; omitted by legacy test fixtures. */
  presentation?: WorkflowMessagePresentation;
  outputs: WorkflowArtifactOutputContract[];
}

export interface ArtifactProvenance {
  workflow?: {
    workflowId: string;
    runId: string;
    stageId: string;
    outputId: string;
  };
}

export interface Artifact {
  id: string;
  userId: string;
  sessionId: string;
  /** Shared project scope; sessionId remains the producing conversation. */
  projectId?: string;
  messageId?: string;
  name: string;
  kind: ArtifactKind;
  mimeType: string;
  storageKey: string;
  createdAt: string;
  /** Present for artifacts produced asynchronously (currently `image` and `video-analysis`). Omitted → treated as ready. */
  status?: "pending" | "ready" | "failed";
  /** Set when status is "failed". */
  error?: string;
  /** Hidden artifacts remain addressable by id but are excluded from normal lists. */
  visibility?: "visible" | "hidden";
  /** Internal role for an artifact used to target an image refinement. */
  purpose?: "annotation";
  /** Durable origin used to map professional Workflow outputs without inference. */
  provenance?: ArtifactProvenance;
}

export type AgentSseEvent =
  /** Durable execution identity and lifecycle state for reconnect/replay. */
  | {
      type: "run";
      runId: string;
      status:
        | "queued"
        | "running"
        | "waiting_approval"
        | "completed"
        | "failed"
        | "cancelled";
    }
  | { type: "session"; sessionId: string }
  | { type: "text_delta"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; ok: boolean; summary: string }
  /**
   * Streaming progress for a tool call (Grok-style Progress items).
   * kind "draft" = write_artifact body snapshot; "text" = free-form log.
   */
  | {
      type: "tool_progress";
      id: string;
      kind: "text" | "draft";
      text?: string;
      name?: string;
    }
  /**
   * Live body of write_artifact while tool arguments are still streaming.
   * Client replaces draft each time (full snapshot so far).
   * Prefer tool_progress { kind: "draft" }; kept for compatibility.
   */
  | { type: "artifact_draft"; name?: string; text: string }
  | { type: "artifact"; artifactId: string; name: string; kind: ArtifactKind }
  /**
   * Model-maintained progress checklist (todo_write).
   * Full snapshot after each update — client replaces UI state.
   */
  | {
      type: "plan";
      todos: Array<{
        id: string;
        content: string;
        status: "pending" | "in_progress" | "completed" | "cancelled";
      }>;
      /** @deprecated prefer todos; kept for older clients */
      steps?: string[];
      summary?: string;
    }
  | { type: "error"; message: string; code?: string }
  | { type: "done"; reason: "completed" | "cancelled" | "error" };
