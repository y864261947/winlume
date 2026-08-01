/**
 * Validate tool arguments (zod) and execute against ArtifactStore.
 * Returns a short string summary for the model (and SSE tool_result).
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AgentSseEvent, Artifact, ArtifactKind } from "@/lib/agent/types";
import {
  parseCanvasContent,
  serializeCanvasContent,
  type CanvasArtifactContent,
} from "@/lib/agent/canvas-content";
import type { ArtifactStore } from "@/lib/host/ports";
import { generateImage } from "@/lib/agent/provider/gateway";
import { publishArtifactEvent } from "@/lib/agent/artifact-events";
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
    scope: z.enum(["session", "project", "user"]).optional(),
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

const generateImageSchema = z.object({
  name: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(4_000),
  model: z.string().trim().min(1).max(100).optional(),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]),
  style: z.string().trim().max(200).optional(),
  count: z.number().int().min(1).max(4),
  sourceArtifactId: z.string().trim().min(1).max(128).optional(),
  sourceArtifactIds: z
    .array(z.string().trim().min(1).max(128))
    .min(1)
    .max(16)
    .optional(),
});

export type GenerateImageArgs = z.infer<typeof generateImageSchema>;

const generateCanvasSchema = z.object({
  name: z.string().trim().min(1).max(200),
  mermaid: z.string().trim().min(1).max(20_000),
  sourceArtifactId: z.string().trim().min(1).max(128).optional(),
});

export type GenerateCanvasArgs = z.infer<typeof generateCanvasSchema>;

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
    case "canvas":
      return "application/vnd.winlume.canvas+json; charset=utf-8";
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
  projectId?: string;
  artifacts: ArtifactStore;
  /** Optional link to the assistant message that issued the tool call */
  messageId?: string;
  /**
   * Mutable turn-scoped todo checklist (shared across tool rounds).
   * Required for todo_write merge semantics.
   */
  todoState?: TodoState;
  /** Exact current user request, preserved when a tool prompt is elaborated by the agent. */
  userIntent?: string;
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
        ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
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

export interface ImageGenerationJob {
  artifact: Artifact;
  ctx: ToolExecuteContext;
  prompt: string;
  model?: string;
  size: "1024x1024" | "1024x1536" | "1536x1024";
  sourceImages?: { bytes: Buffer; mimeType: string }[];
}

/** Runs one generation call and writes the result back to `job.artifact.id`. Never throws. */
export async function runImageGenerationJob(job: ImageGenerationJob): Promise<void> {
  const { artifact, ctx, prompt, model, size, sourceImages } = job;
  try {
    const [image] = await generateImage({ prompt, model, size, n: 1, sourceImages });
    if (!image) throw new Error("Image API returned no results");
    await ctx.artifacts.write(
      { ...artifact, mimeType: image.mimeType, status: "ready", error: undefined },
      image.bytes,
    );
    publishArtifactEvent(ctx.userId, {
      type: "artifact_updated",
      artifactId: artifact.id,
      status: "ready",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    try {
      await ctx.artifacts.write(
        { ...artifact, status: "failed", error: message },
        Buffer.alloc(0),
      );
    } catch {
      // Must never throw/reject — a failed write here (disk error, corrupt
      // index) would otherwise become an unhandled rejection, since callers
      // dispatch this job with a bare `void`.
    }
    publishArtifactEvent(ctx.userId, {
      type: "artifact_updated",
      artifactId: artifact.id,
      status: "failed",
      error: message,
    });
  }
}

export async function executeGenerateImage(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = generateImageSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(`generate_image validation failed: ${formatZodError(parsed.error)}`);
  }
  const {
    name,
    prompt,
    model,
    size,
    style,
    count,
    sourceArtifactId,
    sourceArtifactIds,
  } = parsed.data;

  const requestedSourceIds = sourceArtifactIds ??
    (sourceArtifactId ? [sourceArtifactId] : []);
  const sourceImages: { bytes: Buffer; mimeType: string }[] = [];
  for (const id of requestedSourceIds) {
    const meta = await ctx.artifacts.get(ctx.userId, id);
    if (!meta) return fail(`Source artifact not found: ${id}`);
    const buf = await ctx.artifacts.readContent(ctx.userId, id);
    if (!buf || buf.length === 0) {
      return fail(`Source artifact content missing: ${id}`);
    }
    sourceImages.push({ bytes: buf, mimeType: meta.mimeType });
  }

  const createdAt = new Date().toISOString();
  const styledPrompt = style ? `${prompt} (style: ${style})` : prompt;
  const userIntent = ctx.userIntent?.trim();
  const fullPrompt = userIntent
    ? `Original user request (follow exactly):\n${userIntent}\n\nExecution details:\n${styledPrompt}`
    : styledPrompt;
  const pending: Artifact[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      const artifact = await ctx.artifacts.write(
        {
          id,
          userId: ctx.userId,
          sessionId: ctx.sessionId,
          ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
          ...(ctx.messageId ? { messageId: ctx.messageId } : {}),
          name: count > 1 ? `${name} (${i + 1}/${count})` : name,
          kind: "image",
          mimeType: "application/octet-stream",
          storageKey: "",
          status: "pending",
          createdAt,
        },
        Buffer.alloc(0),
      );
      pending.push(artifact);
      // Dispatch the job immediately after this artifact's write succeeds, so a
      // later write failure in this loop (e.g. artifact 2 of 3) can never orphan
      // an artifact whose write already succeeded — its job is already running.
      void runImageGenerationJob({
        artifact,
        ctx,
        prompt: fullPrompt,
        model,
        size,
        sourceImages: sourceImages.length ? sourceImages : undefined,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "generate_image failed";
    return fail(msg);
  }

  const summary = `Started generating ${pending.length} image(s): ${pending
    .map((a) => a.id)
    .join(", ")}`;
  return {
    ok: true,
    summary,
    content: JSON.stringify({
      artifacts: pending.map((a) => ({ id: a.id, name: a.name, status: a.status })),
    }),
    artifact: pending[0],
    events: pending.map((a) => ({
      type: "artifact" as const,
      artifactId: a.id,
      name: a.name,
      kind: a.kind,
    })),
  };
}

/**
 * Creates or updates a canvas artifact without waiting for client-side Mermaid
 * conversion. Existing scenes stay intact until the browser merges new
 * Mermaid-produced elements with any user-drawn elements.
 */
export async function executeGenerateCanvas(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = generateCanvasSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(`generate_canvas validation failed: ${formatZodError(parsed.error)}`);
  }

  const { name, mermaid, sourceArtifactId } = parsed.data;

  if (sourceArtifactId) {
    const existing = await ctx.artifacts.get(ctx.userId, sourceArtifactId);
    if (!existing) return fail(`Source artifact not found: ${sourceArtifactId}`);
    if (existing.kind !== "canvas") {
      return fail(`Source artifact is not a canvas: ${sourceArtifactId}`);
    }

    const existingBuffer = await ctx.artifacts.readContent(ctx.userId, sourceArtifactId);
    const existingContent = existingBuffer
      ? parseCanvasContent(existingBuffer.toString("utf8"))
      : null;
    const content: CanvasArtifactContent = {
      mermaidSource: mermaid,
      ...(existingContent?.scene ? { scene: existingContent.scene } : {}),
      ...(existingContent?.convertedFromMermaid
        ? { convertedFromMermaid: existingContent.convertedFromMermaid }
        : {}),
    };

    try {
      const artifact = await ctx.artifacts.write(
        { ...existing, name, status: "pending", error: undefined },
        serializeCanvasContent(content),
      );
      return {
        ok: true,
        summary: `Updated canvas "${artifact.name}" (id=${artifact.id})`,
        content: JSON.stringify({ id: artifact.id, name: artifact.name, kind: artifact.kind }),
        artifact,
        events: [
          { type: "artifact", artifactId: artifact.id, name: artifact.name, kind: artifact.kind },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "generate_canvas failed";
      return fail(message);
    }
  }

  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const content: CanvasArtifactContent = { mermaidSource: mermaid };
  try {
    const artifact = await ctx.artifacts.write(
      {
        id,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
        ...(ctx.messageId ? { messageId: ctx.messageId } : {}),
        name,
        kind: "canvas",
        mimeType: mimeTypeForKind("canvas"),
        storageKey: "",
        status: "pending",
        createdAt,
      },
      serializeCanvasContent(content),
    );
    return {
      ok: true,
      summary: `Started canvas "${artifact.name}" (id=${artifact.id})`,
      content: JSON.stringify({ id: artifact.id, name: artifact.name, status: artifact.status }),
      artifact,
      events: [
        { type: "artifact", artifactId: artifact.id, name: artifact.name, kind: artifact.kind },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "generate_canvas failed";
    return fail(message);
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
    if (scope === "project" && !ctx.projectId) {
      return fail("Project artifact scope requires a project context");
    }
    const list =
      scope === "user"
        ? await ctx.artifacts.listByUser(ctx.userId)
        : scope === "project"
          ? await ctx.artifacts.listByProject(ctx.userId, ctx.projectId!)
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
    case "generate_image":
      return executeGenerateImage(rawArgs, ctx);
    case "generate_canvas":
      return executeGenerateCanvas(rawArgs, ctx);
    case "read_artifact":
      return executeReadArtifact(rawArgs, ctx);
    case "list_artifacts":
      return executeListArtifacts(rawArgs, ctx);
    default:
      return fail(`Unknown tool: ${name}`);
  }
}
