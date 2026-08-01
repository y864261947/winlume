import { NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { RunCoordinatorError, getAgentRunService } from "@/lib/agent/infrastructure";
import { stopTurn } from "@/lib/agent/turn-registry";
import { repairDanglingInStore } from "@/lib/agent/dangling";
import { webStore } from "@/lib/host/web/store-singleton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/chat/stop — explicit cancel of the active turn for a session.
 * Body: { sessionId }
 */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { sessionId?: string };
  try {
    body = (await request.json()) as { sessionId?: string };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  if (!sessionId) {
    return Response.json({ error: "sessionId is required" }, { status: 400 });
  }

  const session = await webStore.sessions.getSession(userId, sessionId);
  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  let durableRunId: string | undefined;
  let durableStopped = false;
  try {
    const run = await getAgentRunService().cancelSession(userId, sessionId);
    durableRunId = run?.id;
    durableStopped = Boolean(run);
  } catch (error) {
    if (!(error instanceof RunCoordinatorError) || error.code !== "not_found") {
      return Response.json({ error: "Unable to cancel agent run" }, { status: 500 });
    }
  }

  // Kept during the migration so in-flight pre-durable turns can still be
  // interrupted. Durable cancellation above is the source of truth.
  const result = stopTurn(sessionId, userId);

  // Best-effort repair if stop races with tool persistence
  try {
    await repairDanglingInStore(
      webStore.sessions,
      userId,
      sessionId,
      "cancelled",
    );
  } catch {
    /* ignore */
  }

  return Response.json({
    ok: true,
    stopped: durableStopped || result.stopped,
    ...(durableRunId ? { runId: durableRunId } : {}),
    ...(result.reason ? { reason: result.reason } : {}),
  });
}
