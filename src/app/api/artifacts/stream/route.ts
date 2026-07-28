import { NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  subscribeArtifactEvents,
  type ArtifactStreamEvent,
} from "@/lib/agent/artifact-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15000;

function sseFrame(event: ArtifactStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/**
 * GET /api/artifacts/stream — long-lived SSE connection, independent of any
 * chat turn. Relays artifact status changes published by background image
 * generation jobs (see src/lib/agent/artifact-events.ts).
 */
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const clientSignal = request.signal;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (event: ArtifactStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseFrame(event)));
        } catch {
          cleanup();
        }
      };

      const unsubscribe = subscribeArtifactEvents(userId, send);
      const heartbeat = setInterval(() => send({ type: "ping" }), HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      clientSignal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
