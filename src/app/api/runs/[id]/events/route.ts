import { NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { getAgentRunService } from "@/lib/agent/infrastructure";
import type { AgentRun } from "@/lib/agent/infrastructure";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdContext = { params: Promise<{ id: string }> };

function parseSequence(value: string | null, fallback: number): number | null {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function toPublicRun(run: AgentRun): Omit<AgentRun, "userId"> {
  const { userId, ...publicRun } = run;
  void userId;
  return publicRun;
}

/**
 * GET /api/runs/[id]/events?after=sequence&limit=500
 *
 * Reads the durable event log so a client can recover after an SSE disconnect.
 * The current user check is intentionally isolated here; organization/project
 * membership can replace it when the account layer is introduced.
 */
export async function GET(request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const after = parseSequence(
    request.nextUrl.searchParams.get("after") ?? request.headers.get("last-event-id"),
    0,
  );
  const requestedLimit = parseSequence(request.nextUrl.searchParams.get("limit"), 500);
  if (after === null || requestedLimit === null || requestedLimit === 0) {
    return Response.json({ error: "Invalid event cursor" }, { status: 400 });
  }

  const service = getAgentRunService();
  const run = await service.coordinator.getRun(id);
  if (!run || run.userId !== userId) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const events = await service.coordinator.replay(
    id,
    after,
    Math.min(500, requestedLimit),
  );
  return Response.json(
    {
      run: toPublicRun(run),
      events,
      nextSequence: events.at(-1)?.sequence ?? after,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
