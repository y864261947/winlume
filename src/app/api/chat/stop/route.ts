import { NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
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
    stopped: result.stopped,
    reason: result.reason,
  });
}
