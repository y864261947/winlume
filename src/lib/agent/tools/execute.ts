/**
 * Validate tool arguments (zod) and execute against ArtifactStore.
 * Returns a short string summary for the model (and SSE tool_result).
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type {
  AgentSseEvent,
  Artifact,
  ArtifactKind,
  ArtifactProvenance,
  WorkflowExecutionContext,
} from "@/lib/agent/types";
import {
  parseCanvasContent,
  serializeCanvasContent,
  type CanvasArtifactContent,
} from "@/lib/agent/canvas-content";
import {
  applySheetOperations,
  parseSheetContent,
  serializeSheetContent,
  workbookFromCreateSheets,
  SHEET_MIME,
  type SheetCreateSheet,
  type SheetOperation,
} from "@/lib/agent/sheet-content";
import { artifactOutputIdSchema } from "@/lib/agent/skills/contracts";
import type { ArtifactStore } from "@/lib/host/ports";
import { toolJobStore } from "@/lib/host/web/tool-job-singleton";
import {
  buildEcommerceImageSetPlan,
  type EcommerceImageSetSize,
  type EcommerceImageSetTemplate,
} from "@/lib/studio/ecommerce-image-set";
import {
  createEcommerceImageSetJob,
  type EcommerceImageSetJob,
  type ToolJobStore,
} from "@/lib/studio/tool-jobs";
import {
  BACKGROUND_REMOVAL_SUBJECTS,
  getStudioTool,
  isStudioToolImageMimeType,
  validateStudioToolParams,
  type StudioToolId,
  type StudioToolParams,
} from "@/lib/studio/tool-catalog";
import { generateImage } from "@/lib/agent/provider/gateway";
import { resolveStudioToken } from "@/lib/agent/provider/studio-token";
import { publishArtifactEvent } from "@/lib/agent/artifact-events";
import { invokeToolCapability } from "./providers/registry";
import {
  executeStudioTool as executeCatalogStudioTool,
  StudioToolExecutionError,
} from "./tool-execution";
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
  outputId: artifactOutputIdSchema.optional(),
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
  outputId: artifactOutputIdSchema.optional(),
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

const fuseImagesSchema = z.object({
  name: z.string().trim().min(1).max(200),
  outputId: artifactOutputIdSchema.optional(),
  prompt: z.string().trim().min(1).max(1_200),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]),
  sourceArtifactIds: z
    .array(z.string().trim().min(1).max(128))
    .length(2)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "sourceArtifactIds must reference two different images",
    }),
});

const ecommerceImageSetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sourceArtifactId: z.string().trim().min(1).max(128),
  referenceArtifactId: z.string().trim().min(1).max(128).optional(),
  template: z.enum(["product", "apparel"]),
  prompt: z.string().trim().max(1_200).optional().default(""),
  size: z.enum(["1024x1024", "1024x1536", "1536x1024"]),
});

export type GenerateImageArgs = z.infer<typeof generateImageSchema>;
export type FuseImagesArgs = z.infer<typeof fuseImagesSchema>;
export type EcommerceImageSetArgs = z.infer<typeof ecommerceImageSetSchema>;

const imageToolInputSchema = z.object({
  sourceArtifactId: z.string().trim().min(1).max(128),
  outputId: artifactOutputIdSchema.optional(),
});

const removeBackgroundSchema = imageToolInputSchema.extend({
  subject: z.enum(BACKGROUND_REMOVAL_SUBJECTS).default("auto"),
});
const upscaleImageSchema = imageToolInputSchema.extend({
  mode: z.enum(["standard", "generative"]),
});
const removeWatermarkOrSubtitlesSchema = imageToolInputSchema.extend({
  target: z.enum(["watermark", "subtitles"]),
  rightsConfirmed: z.literal(true),
});

export type RemoveBackgroundArgs = z.infer<typeof removeBackgroundSchema>;
export type UpscaleImageArgs = z.infer<typeof upscaleImageSchema>;
export type RemoveWatermarkOrSubtitlesArgs = z.infer<
  typeof removeWatermarkOrSubtitlesSchema
>;

const generateCanvasSchema = z.object({
  name: z.string().trim().min(1).max(200),
  outputId: artifactOutputIdSchema.optional(),
  mermaid: z.string().trim().min(1).max(20_000),
  sourceArtifactId: z.string().trim().min(1).max(128).optional(),
});

export type GenerateCanvasArgs = z.infer<typeof generateCanvasSchema>;

const sheetCellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const sheetOperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("setValues"),
    sheet: z.string().trim().min(1).max(80).optional(),
    start: z.string().trim().min(2).max(8),
    values: z.array(z.array(sheetCellValueSchema).max(40)).min(1).max(200),
  }),
  z.object({
    op: z.literal("setFormulas"),
    sheet: z.string().trim().min(1).max(80).optional(),
    start: z.string().trim().min(2).max(8),
    formulas: z.array(z.array(z.string().trim().min(1).max(2_000)).min(1).max(40)).min(1).max(200),
  }),
  z.object({
    op: z.literal("clearRange"),
    sheet: z.string().trim().min(1).max(80).optional(),
    range: z.string().trim().min(2).max(20),
  }),
  z.object({
    op: z.literal("addSheet"),
    name: z.string().trim().min(1).max(80),
  }),
  z.object({
    op: z.literal("renameSheet"),
    sheet: z.string().trim().min(1).max(80),
    name: z.string().trim().min(1).max(80),
  }),
  z.object({
    op: z.literal("deleteSheet"),
    sheet: z.string().trim().min(1).max(80),
  }),
]);

const generateSheetSchema = z.object({
  name: z.string().trim().min(1).max(200),
  outputId: artifactOutputIdSchema.optional(),
  sourceArtifactId: z.string().trim().min(1).max(128).optional(),
  sheets: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        values: z.array(z.array(sheetCellValueSchema).max(40)).max(200).optional(),
        formulas: z
          .array(
            z.object({
              cell: z.string().trim().min(2).max(8),
              formula: z.string().trim().min(1).max(2_000),
            }),
          )
          .max(200)
          .optional(),
      }),
    )
    .min(1)
    .max(8)
    .optional(),
  operations: z.array(sheetOperationSchema).min(1).max(40).optional(),
});

export type GenerateSheetArgs = z.infer<typeof generateSheetSchema>;

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
      return "application/vnd.reizo.canvas+json; charset=utf-8";
    case "sheet":
      return SHEET_MIME;
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
  runId?: string;
  workflow?: WorkflowExecutionContext;
  artifacts: ArtifactStore;
  /** Durable tool-owned jobs. Defaults to the single-node web adapter. */
  toolJobs?: ToolJobStore;
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
  /** Multiple artifacts produced by a grouped tool operation. */
  artifacts?: Artifact[];
  /** Present for long-running ToolJob-backed tools. */
  job?: EcommerceImageSetJob;
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

function resolveArtifactProvenance(
  kind: ArtifactKind,
  outputId: string | undefined,
  ctx: ToolExecuteContext,
): { provenance?: ArtifactProvenance; error?: string } {
  if (!ctx.workflow) {
    return outputId
      ? { error: "outputId is only available during a Workflow Run" }
      : {};
  }
  if (!ctx.runId || ctx.runId !== ctx.workflow.runId) {
    return { error: "Workflow Run context is invalid" };
  }

  const compatible = ctx.workflow.outputs.filter((output) => output.kinds.includes(kind));
  const selected = outputId
    ? ctx.workflow.outputs.find((output) => output.id === outputId)
    : compatible.length === 1
      ? compatible[0]
      : undefined;
  if (!selected) {
    return {
      error: outputId
        ? `Unknown Workflow output: ${outputId}`
        : "outputId is required when a Stage has multiple compatible outputs",
    };
  }
  if (!selected.kinds.includes(kind)) {
    return {
      error: `Workflow output ${selected.id} does not accept Artifact kind ${kind}`,
    };
  }

  return {
    provenance: {
      workflow: {
        workflowId: ctx.workflow.workflowId,
        runId: ctx.workflow.runId,
        stageId: ctx.workflow.stageId,
        outputId: selected.id,
      },
    },
  };
}

export async function executeWriteArtifact(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = writeArtifactSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(`write_artifact validation failed: ${formatZodError(parsed.error)}`);
  }
  const { name, kind, content, outputId } = parsed.data;
  const provenance = resolveArtifactProvenance(kind, outputId, ctx);
  if (provenance.error) return fail(provenance.error);
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
        ...(provenance.provenance ? { provenance: provenance.provenance } : {}),
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
    const token = await resolveStudioToken(ctx.userId);
    const [image] = await generateImage({
      prompt,
      model,
      size,
      n: 1,
      sourceImages,
      userId: ctx.userId,
      token,
    });
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
    outputId,
    prompt,
    model,
    size,
    style,
    count,
    sourceArtifactId,
    sourceArtifactIds,
  } = parsed.data;
  const provenance = resolveArtifactProvenance("image", outputId, ctx);
  if (provenance.error) return fail(provenance.error);

  const requestedSourceIds = sourceArtifactIds ??
    (sourceArtifactId ? [sourceArtifactId] : []);
  const sourceImages: { bytes: Buffer; mimeType: string }[] = [];
  for (const id of requestedSourceIds) {
    const meta = await ctx.artifacts.get(ctx.userId, id);
    if (!meta) return fail(`Source artifact not found: ${id}`);
    if (meta.kind !== "image" || !isStudioToolImageMimeType(meta.mimeType)) {
      return fail(`Source artifact is not a supported image: ${id}`);
    }
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
  const workflowJobs: Promise<void>[] = [];
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
          ...(provenance.provenance ? { provenance: provenance.provenance } : {}),
        },
        Buffer.alloc(0),
      );
      pending.push(artifact);
      // Dispatch the job immediately after this artifact's write succeeds, so a
      // later write failure in this loop (e.g. artifact 2 of 3) can never orphan
      // an artifact whose write already succeeded — its job is already running.
      const job = runImageGenerationJob({
        artifact,
        ctx,
        prompt: fullPrompt,
        model,
        size,
        sourceImages: sourceImages.length ? sourceImages : undefined,
      });
      if (ctx.workflow) workflowJobs.push(job);
      else void job;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "generate_image failed";
    return fail(msg);
  }

  if (ctx.workflow) await Promise.all(workflowJobs);
  const artifacts = ctx.workflow
    ? await Promise.all(
        pending.map(async (artifact) =>
          (await ctx.artifacts.get(ctx.userId, artifact.id)) ?? artifact,
        ),
      )
    : pending;
  const summary = `${ctx.workflow ? "Finished" : "Started"} generating ${artifacts.length} image(s): ${artifacts
    .map((a) => a.id)
    .join(", ")}`;
  return {
    ok: true,
    summary,
    content: JSON.stringify({
      artifacts: artifacts.map((a) => ({ id: a.id, name: a.name, status: a.status })),
    }),
    artifact: artifacts[0],
    artifacts,
    events: artifacts.map((a) => ({
      type: "artifact" as const,
      artifactId: a.id,
      name: a.name,
      kind: a.kind,
    })),
  };
}

/** Starts an asynchronous two-image composition through the shared image gateway. */
export async function executeFuseImages(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = fuseImagesSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(`fuse_images validation failed: ${formatZodError(parsed.error)}`);
  }
  return executeGenerateImage({ ...parsed.data, count: 1 }, ctx);
}

/**
 * Reconcile durable tool state from its output artifacts. This is deliberately
 * callable by the job endpoint too, so a process restart cannot strand a job
 * in "generating" solely because its in-memory timer disappeared.
 */
export async function reconcileEcommerceImageSetJob(
  jobId: string,
  dependencies: Pick<ToolExecuteContext, "artifacts"> & { toolJobs?: ToolJobStore },
): Promise<EcommerceImageSetJob | null> {
  const jobs = dependencies.toolJobs ?? toolJobStore;
  const latest = await jobs.get(jobId);
  if (!latest || latest.stage !== "generating" || !latest.outputArtifactIds.length) return latest;

  const outputs = await Promise.all(
    latest.outputArtifactIds.map((id) => dependencies.artifacts.get(latest.userId, id)),
  );
  const failed = outputs.find((artifact) => artifact?.status === "failed");
  if (failed) {
    return jobs.update(latest.id, {
      stage: "failed",
      error: failed.error ?? "电商套图生成失败",
      usage: latest.usage.map((entry) => entry.capability === "image.reference_edit"
        ? { ...entry, status: "failed", recordedAt: new Date().toISOString() }
        : entry),
    });
  }

  const allReady = outputs.length === latest.outputArtifactIds.length && outputs.every(
    (artifact) => artifact && artifact.status === "ready",
  );
  if (!allReady) return latest;

  return jobs.update(latest.id, {
    stage: "review",
    evaluation: {
      status: "needs_review",
      reason: "首版已完成商品锁定与镜头规划；视觉评分节点尚未接入，结果待人工确认。",
      updatedAt: new Date().toISOString(),
    },
    usage: latest.usage.map((entry) => entry.capability === "image.reference_edit"
      ? { ...entry, status: "completed", recordedAt: new Date().toISOString() }
      : entry),
  });
}

function scheduleEcommerceJobReview(
  job: EcommerceImageSetJob,
  ctx: ToolExecuteContext,
  attempt = 0,
): void {
  const timer = setTimeout(() => {
    void reconcileEcommerceImageSetJob(job.id, { artifacts: ctx.artifacts, toolJobs: ctx.toolJobs })
      .then((latest) => {
        if (latest?.stage === "generating" && attempt < 400) {
          scheduleEcommerceJobReview(latest, ctx, attempt + 1);
        }
      })
      .catch(() => {
        // Artifact status remains the source of truth if best-effort job tracking fails.
      });
  }, 750);
  timer.unref?.();
}

/** Starts the first provider-neutral e-commerce image-set ToolJob. */
export async function executeEcommerceImageSet(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = ecommerceImageSetSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(
      `generate_ecommerce_image_set validation failed: ${formatZodError(parsed.error)}`,
    );
  }

  const { name, prompt, size, sourceArtifactId, referenceArtifactId, template } = parsed.data;
  if (referenceArtifactId === sourceArtifactId) {
    return fail("参考图不能与商品图相同");
  }

  const jobs = ctx.toolJobs ?? toolJobStore;
  let job = createEcommerceImageSetJob({
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
    sourceArtifactId,
    ...(referenceArtifactId ? { referenceArtifactId } : {}),
    template: template as EcommerceImageSetTemplate,
    size: size as EcommerceImageSetSize,
    prompt,
  });

  try {
    job = await jobs.create(job);
    job = await jobs.update(job.id, { stage: "cutting_out" });

    const cutoutTool = getStudioTool("background-removal");
    if (!cutoutTool) throw new Error("Tool catalog is missing background-removal");
    const cutout = await executeCatalogStudioTool(
      {
        tool: cutoutTool,
        userId: ctx.userId,
        sourceArtifactId,
        params: { subject: "product" },
        output: {
          sessionId: ctx.sessionId,
          ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
          ...(ctx.messageId ? { messageId: ctx.messageId } : {}),
          visibility: "hidden",
        },
      },
      { artifacts: ctx.artifacts, invokeCapability: invokeToolCapability },
    );

    const plan = buildEcommerceImageSetPlan({
      template: template as EcommerceImageSetTemplate,
      size: size as EcommerceImageSetSize,
      prompt,
      hasReferenceImage: Boolean(referenceArtifactId),
    });
    job = await jobs.update(job.id, {
      stage: "planning",
      cutoutArtifactId: cutout.id,
      plan,
      usage: [
        { capability: "image.background_removal", provider: "aliyun", status: "completed", recordedAt: new Date().toISOString() },
      ],
    });

    // GPT-Image treats the first supplied image as the editable base. The
    // transparent product is therefore first; the original preserves labels
    // and material details, while an optional third image supplies style only.
    const sourceArtifactIds = [cutout.id, sourceArtifactId, referenceArtifactId].filter(
      (id): id is string => Boolean(id),
    );
    const shotResults = await Promise.all(
      plan.shots.map((shot) => executeGenerateImage(
        {
          name: `${name} - ${shot.name}`,
          prompt: shot.prompt,
          size,
          count: 1,
          sourceArtifactIds,
        },
        ctx,
      )),
    );
    const failedResult = shotResults.find((result) => !result.ok);
    if (failedResult) throw new Error(failedResult.summary);

    const artifacts = shotResults.flatMap((result) => result.artifacts ?? []);
    if (artifacts.length !== plan.shots.length) {
      throw new Error("Unable to start the complete e-commerce image set");
    }
    job = await jobs.update(job.id, {
      stage: "generating",
      outputArtifactIds: artifacts.map((artifact) => artifact.id),
      usage: [
        ...job.usage,
        {
          capability: "image.reference_edit",
          provider: "new-api",
          status: "started",
          requestedOutputs: artifacts.length,
          recordedAt: new Date().toISOString(),
        },
      ],
    });
    scheduleEcommerceJobReview(job, ctx);
    return {
      ok: true,
      summary: `Started e-commerce image-set job ${job.id} with ${artifacts.length} image(s)`,
      content: JSON.stringify({
        job: { id: job.id, stage: job.stage, pipelineVersion: job.pipelineVersion },
        artifacts: artifacts.map((artifact) => ({
          id: artifact.id,
          name: artifact.name,
          status: artifact.status,
        })),
      }),
      artifact: artifacts[0],
      artifacts,
      job,
      events: shotResults.flatMap((result) => result.events ?? []),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start e-commerce image set";
    try {
      job = await jobs.update(job.id, { stage: "failed", error: message });
    } catch {
      // A creation failure has no durable job to update.
    }
    return {
      ...fail(message),
      job,
    };
  }
}

async function executeCatalogImageTool(
  toolId: StudioToolId,
  agentToolName: string,
  args: { sourceArtifactId: string; outputId?: string },
  params: StudioToolParams,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const tool = getStudioTool(toolId);
  if (!tool) return fail(`Tool catalog is missing ${toolId}`);

  const validated = validateStudioToolParams(tool, params);
  if (!validated.params) return fail(`${agentToolName} validation failed: ${validated.error}`);

  const provenance = resolveArtifactProvenance("image", args.outputId, ctx);
  if (provenance.error) return fail(provenance.error);

  try {
    const artifact = await executeCatalogStudioTool(
      {
        tool,
        userId: ctx.userId,
        sourceArtifactId: args.sourceArtifactId,
        params: validated.params,
        output: {
          sessionId: ctx.sessionId,
          ...(ctx.projectId ? { projectId: ctx.projectId } : {}),
          ...(ctx.messageId ? { messageId: ctx.messageId } : {}),
          ...(provenance.provenance ? { provenance: provenance.provenance } : {}),
        },
      },
      { artifacts: ctx.artifacts, invokeCapability: invokeToolCapability },
    );
    return {
      ok: true,
      summary: `${tool.name} completed (id=${artifact.id})`,
      content: JSON.stringify({
        id: artifact.id,
        name: artifact.name,
        kind: artifact.kind,
        status: artifact.status,
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
  } catch (error) {
    if (error instanceof StudioToolExecutionError) return fail(error.message);
    return fail(`${tool.name} failed; please try again shortly`);
  }
}

/** Runs a synchronous background-removal capability and persists its ready PNG. */
export async function executeRemoveBackground(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = removeBackgroundSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(`remove_background validation failed: ${formatZodError(parsed.error)}`);
  }
  return executeCatalogImageTool(
    "background-removal",
    "remove_background",
    parsed.data,
    { subject: parsed.data.subject },
    ctx,
  );
}

export async function executeUpscaleImage(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = upscaleImageSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(`upscale_image validation failed: ${formatZodError(parsed.error)}`);
  }
  return executeCatalogImageTool(
    "image-clarity",
    "upscale_image",
    parsed.data,
    { mode: parsed.data.mode },
    ctx,
  );
}

export async function executeRemoveWatermarkOrSubtitles(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = removeWatermarkOrSubtitlesSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(
      `remove_watermark_or_subtitles validation failed: ${formatZodError(parsed.error)}`,
    );
  }
  return executeCatalogImageTool(
    "watermark-subtitle-removal",
    "remove_watermark_or_subtitles",
    parsed.data,
    { target: parsed.data.target, rightsConfirmed: parsed.data.rightsConfirmed },
    ctx,
  );
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

  const { name, outputId, mermaid, sourceArtifactId } = parsed.data;
  const provenance = resolveArtifactProvenance("canvas", outputId, ctx);
  if (provenance.error) return fail(provenance.error);

  if (sourceArtifactId) {
    if (ctx.workflow) {
      return fail("Workflow canvas outputs must create a new Artifact");
    }
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
        // Mermaid source is the durable Workflow deliverable. The Studio may
        // hydrate an Excalidraw scene later, but Stage completion must not wait
        // on a browser-side projection.
        status: ctx.workflow ? "ready" : "pending",
        createdAt,
        ...(provenance.provenance ? { provenance: provenance.provenance } : {}),
      },
      serializeCanvasContent(content),
    );
    return {
      ok: true,
      summary: `${ctx.workflow ? "Created" : "Started"} canvas "${artifact.name}" (id=${artifact.id})`,
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

export async function executeGenerateSheet(
  rawArgs: unknown,
  ctx: ToolExecuteContext,
): Promise<ToolExecuteResult> {
  const parsed = generateSheetSchema.safeParse(rawArgs);
  if (!parsed.success) {
    return fail(`generate_sheet validation failed: ${formatZodError(parsed.error)}`);
  }

  const { name, outputId, sourceArtifactId, sheets, operations } = parsed.data;
  const provenance = resolveArtifactProvenance("sheet", outputId, ctx);
  if (provenance.error) return fail(provenance.error);

  if (sourceArtifactId) {
    if (ctx.workflow) {
      return fail("Workflow sheet outputs must create a new Artifact");
    }
    if (!operations?.length) {
      return fail("Patching a workbook requires operations");
    }
    const existing = await ctx.artifacts.get(ctx.userId, sourceArtifactId);
    if (!existing) return fail(`Source artifact not found: ${sourceArtifactId}`);
    if (existing.kind !== "sheet") {
      return fail(`Source artifact is not a sheet: ${sourceArtifactId}`);
    }
    const existingBuffer = await ctx.artifacts.readContent(ctx.userId, sourceArtifactId);
    const existingContent = existingBuffer
      ? parseSheetContent(existingBuffer.toString("utf8"))
      : null;
    if (!existingContent) {
      return fail("Existing workbook content is unreadable");
    }
    const patched = applySheetOperations(existingContent, operations as SheetOperation[]);
    if ("error" in patched) return fail(patched.error);

    try {
      const artifact = await ctx.artifacts.write(
        { ...existing, name, status: "ready", error: undefined },
        serializeSheetContent(patched.content),
      );
      publishArtifactEvent(ctx.userId, {
        type: "artifact_updated",
        artifactId: artifact.id,
        status: "ready",
      });
      return {
        ok: true,
        summary: `Updated sheet "${artifact.name}" (id=${artifact.id}, revision=${patched.content.revision})`,
        content: JSON.stringify({
          id: artifact.id,
          name: artifact.name,
          kind: artifact.kind,
          revision: patched.content.revision,
        }),
        artifact,
        events: [
          { type: "artifact", artifactId: artifact.id, name: artifact.name, kind: artifact.kind },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "generate_sheet failed";
      return fail(message);
    }
  }

  if (!sheets?.length && !operations?.length) {
    return fail("Creating a workbook requires sheets or operations");
  }

  let contentResult = sheets?.length
    ? workbookFromCreateSheets(sheets as SheetCreateSheet[])
    : workbookFromCreateSheets([{ name: "Sheet1" }]);
  if ("error" in contentResult) return fail(contentResult.error);
  if (operations?.length) {
    contentResult = applySheetOperations(contentResult.content, operations as SheetOperation[]);
    if ("error" in contentResult) return fail(contentResult.error);
  }

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
        kind: "sheet",
        mimeType: mimeTypeForKind("sheet"),
        storageKey: "",
        status: "ready",
        createdAt,
        ...(provenance.provenance ? { provenance: provenance.provenance } : {}),
      },
      serializeSheetContent(contentResult.content),
    );
    publishArtifactEvent(ctx.userId, {
      type: "artifact_updated",
      artifactId: artifact.id,
      status: "ready",
    });
    return {
      ok: true,
      summary: `Created sheet "${artifact.name}" (id=${artifact.id})`,
      content: JSON.stringify({ id: artifact.id, name: artifact.name, kind: artifact.kind }),
      artifact,
      events: [
        { type: "artifact", artifactId: artifact.id, name: artifact.name, kind: artifact.kind },
      ],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "generate_sheet failed";
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
    case "fuse_images":
      return executeFuseImages(rawArgs, ctx);
    case "generate_ecommerce_image_set":
      return executeEcommerceImageSet(rawArgs, ctx);
    case "remove_background":
      return executeRemoveBackground(rawArgs, ctx);
    case "upscale_image":
      return executeUpscaleImage(rawArgs, ctx);
    case "remove_watermark_or_subtitles":
      return executeRemoveWatermarkOrSubtitles(rawArgs, ctx);
    case "generate_canvas":
      return executeGenerateCanvas(rawArgs, ctx);
    case "generate_sheet":
      return executeGenerateSheet(rawArgs, ctx);
    case "read_artifact":
      return executeReadArtifact(rawArgs, ctx);
    case "list_artifacts":
      return executeListArtifacts(rawArgs, ctx);
    default:
      return fail(`Unknown tool: ${name}`);
  }
}
