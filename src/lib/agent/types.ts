export type Role = "user" | "assistant" | "system" | "tool";

export interface Session {
  id: string;
  userId: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: string;
  result?: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: Role;
  content: string;
  skillIds?: string[];
  toolCalls?: ToolCallRecord[];
  attachmentIds?: string[];
  createdAt: string;
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  triggers?: string[];
  examplePrompt?: string;
  preview?: "markdown" | "html" | "none";
  source: "bundled" | "imported" | "user";
  enabled: boolean;
}

export interface Skill extends SkillMeta {
  systemPrompt: string;
}

export type ArtifactKind = "markdown" | "html" | "text" | "json" | "image" | "binary";

export interface Artifact {
  id: string;
  userId: string;
  sessionId: string;
  messageId?: string;
  name: string;
  kind: ArtifactKind;
  mimeType: string;
  storageKey: string;
  createdAt: string;
}

export type AgentSseEvent =
  | { type: "session"; sessionId: string }
  | { type: "text_delta"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; ok: boolean; summary: string }
  | { type: "artifact"; artifactId: string; name: string; kind: ArtifactKind }
  | { type: "error"; message: string; code?: string }
  | { type: "done"; reason: "completed" | "cancelled" | "error" };
