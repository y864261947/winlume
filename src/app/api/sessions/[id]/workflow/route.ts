import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  RunStoreError,
  getAgentRunService,
} from "@/lib/agent/infrastructure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdContext = { params: Promise<{ id: string }> };

const idSchema = z.string().trim().min(1).max(160);
const commandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("approve"),
      runId: idSchema,
      note: z.string().trim().min(1).max(2_000).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("request_changes"),
      runId: idSchema,
      note: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      action: z.literal("start_next"),
      runId: idSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("retry_stage"),
      runId: idSchema,
    })
    .strict(),
]);

function workflowError(error: unknown): NextResponse {
  if (error instanceof RunStoreError) {
    const status =
      error.code === "not_found" ? 404 : error.code === "revision_conflict" ? 409 : 409;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  if (error instanceof Error && /not found/i.test(error.message)) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }
  return NextResponse.json(
    { error: "Workflow state could not be applied" },
    { status: 409 },
  );
}

export async function GET(_request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: sessionId } = await context.params;
  try {
    const workflow = await getAgentRunService().getWorkflowProjection(
      userId,
      sessionId,
    );
    return NextResponse.json({ workflow });
  } catch (error) {
    return workflowError(error);
  }
}

export async function POST(request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 160) {
    return NextResponse.json(
      { error: "A valid Idempotency-Key header is required" },
      { status: 400 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = commandSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Workflow command" }, { status: 400 });
  }

  const { id: sessionId } = await context.params;
  const service = getAgentRunService();
  try {
    const result = await service.executeWorkflowCommand({
      ...parsed.data,
      userId,
      sessionId,
      idempotencyKey,
      occurredAt: new Date().toISOString(),
    });
    const workflow = await service.getWorkflowProjection(userId, sessionId);
    return NextResponse.json({
      command: {
        sourceRunId: result.sourceRun.id,
        ...(result.startedRun ? { startedRunId: result.startedRun.id } : {}),
        created: result.created,
      },
      workflow,
    });
  } catch (error) {
    return workflowError(error);
  }
}
