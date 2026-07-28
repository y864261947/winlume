/**
 * Validate tool arguments (zod) and execute against ArtifactStore.
 * Returns a short string summary for the model (and SSE tool_result).
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AgentSseEvent, Artifact, ArtifactKind } from "@/lib/agent/types";
import type { ArtifactStore } from "@/lib/host/ports";
import {
  applyMerge,
  applyReplace,
  shouldAutoMerge,
  summarizeTodoState,
  validateNoDuplicateIds,
  type TodoState,
  type TodoStatus,
  type TodoUpdate,
} from "@/lib/agent/todo-state";

/** Soft cap for content returned to the model from read_artifact. */
export const READ_CONTENT_MAX_CHARS = 24_000;

const writeArtifactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["markdown", "html", "text", "json"]),
  content: z.string().min(1).max(2_000_000),
});

const readArtifactSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

const listArtifactsSchema = z
  .object({
    scope: z.enum(["session", "user"]).optional(),
  })
  .default({});

const todoStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "cancelled",
]);

const todoWriteSchema = z.object({
  merge: z.boolean().optional().default(true),
  explanation: z.string().trim().max(200).optional(),
  todos: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        content: z.string().trim().max(80).optional(),
        status: todoStatusSchema.optional(),
      }),
    )
    .min(1)
    .max(12),
});

export type WriteArtifactArgs = z.infer<typeof writeArtifactSchema>;
export type ReadArtifactArgs = z.infer<typeof readArtifactSchema>;
export type ListArtifactsArgs = z.infer<typeof listArtifactsSchema>;

export function mimeTypeForKind(kind: ArtifactKind): string {
  switch (kind) {
    case "markdown":
      return "text/markdown; charset=utf-8";
    case "html":
      return "text/html; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
    case "text":
      return "text/plain; charset=utf-8";
    case "image":
      return "application/octet-stream";
    case "binary":
      return "application/octet-stream";
    default:
      return "application/octet-stream";
  }
}

/** Parse JSON arguments from the model; empty / missing → {}. */
export function parseToolArgumentsJson(raw: string | undefined | null): unknown {
  const text = (raw ?? "").trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Invalid tool arguments JSON: ${text.slice(0, 120)}`);
  }
}

export function truncateForModel(text: string, maxChars = READ_CONTENT_MAX_CHARS): {
  text: string;
  truncated: boolean;
} {
  if (text.length <= maxChars) return { text, truncated: false };
  return {
    text: `${text.slice(0, maxChars)}\n\n…[truncated ${text.length - maxChars} chars]`,
    truncated: true,
  };
}

export interface ToolExecuteContext {
  userId: string;
  sessionId: string;
  artifacts: ArtifactStore;
  /** Optional link to the assistant message that issued the tool call */
  messageId?: string;
  /**
   * Mutable turn-scoped todo checklist (shared across tool rounds).
   * Required for todo_write merge semantics.
   */
  todoState?: TodoState;
}

export interface ToolExecuteResult {
  ok: boolean;
  /** Short summary for SSE / model */
  summary: string;
  /** Full string content for the tool role message (may equal summary) */
  content: string;
  /** When write_artifact succeeds */
  artifact?: Artifact;
  /** SSE side-effects the runtime should yield after tool_result */
  events?: AgentSseEvent[];
}

function fail(message: string): ToolExecuteResult {
  return { ok: false, summary: message, content: message };
}

function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join(".") || "args"}: ${i.message}`)
    .join("; ");
}

export async function executeWriteArtifact(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = writeArtifactSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(`write_artifact validation failed: ${formatZodError(parsed.error)}`);
  }
  const { name, kind, content } = parsed.data;
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  try {
    const artifact = await ctx.artifacts.write(
      {
        id,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        ...(ctx.messageId ? { messageId: ctx.messageId } : {}),
        name,
        kind,
        mimeType: mimeTypeForKind(kind),
        storageKey: "",
        createdAt,
      },
      content,
    );
    const summary = `Saved artifact "${artifact.name}" (id=${artifact.id}, kind=${artifact.kind}, ${content.length} chars)`;
    return {
      ok: true,
      summary,
      content: JSON.stringify({
        id: artifact.id,
        name: artifact.name,
        kind: artifact.kind,
        chars: content.length,
      }),
      artifact,
      events: [
        {
          type: "artifact",
          artifactId: artifact.id,
          name: artifact.name,
          kind: artifact.kind,
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "write_artifact failed";
    return fail(msg);
  }
}

export async function executeReadArtifact(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = readArtifactSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(`read_artifact validation failed: ${formatZodError(parsed.error)}`);
  }
  const { id } = parsed.data;
  try {
    const meta = await ctx.artifacts.get(ctx.userId, id);
    if (!meta) {
      return fail(`Artifact not found: ${id}`);
    }
    const buf = await ctx.artifacts.readContent(ctx.userId, id);
    if (!buf) {
      return fail(`Artifact content missing: ${id}`);
    }
    const raw = buf.toString("utf8");
    const { text, truncated } = truncateForModel(raw);
    const summary = truncated
      ? `Read artifact "${meta.name}" (id=${meta.id}, truncated to ${READ_CONTENT_MAX_CHARS} chars)`
      : `Read artifact "${meta.name}" (id=${meta.id}, ${raw.length} chars)`;
    return {
      ok: true,
      summary,
      content: JSON.stringify({
        id: meta.id,
        name: meta.name,
        kind: meta.kind,
        truncated,
        content: text,
      }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "read_artifact failed";
    return fail(msg);
  }
}

export async function executeListArtifacts(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = listArtifactsSchema.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    return fail(`list_artifacts validation failed: ${formatZodError(parsed.error)}`);
  }
  const scope = parsed.data.scope ?? "session";
  try {
    const list =
      scope === "user"
        ? await ctx.artifacts.listByUser(ctx.userId)
        : await ctx.artifacts.listBySession(ctx.userId, ctx.sessionId);
    const items = list.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      sessionId: a.sessionId,
      createdAt: a.createdAt,
    }));
    const summary =
      items.length === 0
        ? `No artifacts (${scope})`
        : `Found ${items.length} artifact(s) (${scope})`;
    return {
      ok: true,
      summary,
      content: JSON.stringify({ scope, count: items.length, artifacts: items }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "list_artifacts failed";
    return fail(msg);
  }
}

export async function executeTodoWrite(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = todoWriteSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(`todo_write validation failed: ${formatZodError(parsed.error)}`);
  }
  if (!ctx.todoState) {
    return fail("todo_write: no turn state available");
  }

  const updates: TodoUpdate[] = parsed.data.todos.map((t) => ({
    id: t.id.trim(),
    ...(t.content !== undefined ? { content: t.content } : {}),
    ...(t.status !== undefined ? { status: t.status as TodoStatus } : {}),
  }));

  const dup = validateNoDuplicateIds(updates);
  if (dup) {
    return fail(
      `Duplicate todo ID in request: "${dup}". Each todo item must have a unique ID.`,
    );
  }

  const state = ctx.todoState;
  const merge = shouldAutoMerge(state, parsed.data.merge !== false, updates);
  if (merge) {
    applyMerge(state, updates);
  } else {
    applyReplace(state, updates);
  }

  const todos = state.list();
  const summaryForPrompt = summarizeTodoState(state);
  const explanation = parsed.data.explanation?.trim();
  const active = todos.find((t) => t.status === "in_progress");
  const baseSummary = active
    ? `进度更新 · 进行中：${active.content}`
    : todos.every((t) => t.status === "completed" || t.status === "cancelled")
      ? `进度完成 · ${todos.length} 项`
      : `进度更新 · ${todos.length} 项`;
  const summary = explanation
    ? `${baseSummary} · ${explanation.slice(0, 80)}`
    : baseSummary;

  return {
    ok: true,
    summary,
    content: JSON.stringify({
      todos,
      summary: summaryForPrompt,
      merge,
      ...(explanation ? { explanation } : {}),
    }),
    events: [
      {
        type: "plan",
        todos: todos.map((t) => ({
          id: t.id,
          content: t.content,
          status: t.status,
        })),
        ...(explanation ? { summary: explanation } : {}),
      },
    ],
  };
}

export async function executeStudioTool(
  name: string,
  argumentsJson: string,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  let rawArgs: unknown;
  try {
    rawArgs = parseToolArgumentsJson(argumentsJson);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid arguments";
    return fail(msg);
  }

  switch (name) {
    case "todo_write":
      // Accept legacy name during transition
      return executeTodoWrite(rawArgs, ctx);
    case "declare_plan": {
      // Legacy: { steps: string[] } → replace todos
      const legacy = rawArgs as { steps?: unknown; summary?: unknown };
      if (Array.isArray(legacy?.steps)) {
        const steps = legacy.steps
          .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
          .slice(0, 12);
        return executeTodoWrite(
          {
            merge: false,
            todos: steps.map((content, i) => ({
              id: `step_${i + 1}`,
              content: content.trim().slice(0, 80),
              status: i === 0 ? "in_progress" : "pending",
            })),
          },
          ctx,
        );
      }
      return executeTodoWrite(rawArgs, ctx);
    }
    case "write_artifact":
      return executeWriteArtifact(rawArgs, ctx);
    case "read_artifact":
      return executeReadArtifact(rawArgs, ctx);
    case "list_artifacts":
      return executeListArtifacts(rawArgs, ctx);
    default:
      return fail(`Unknown tool: ${name}`);
  }
}
