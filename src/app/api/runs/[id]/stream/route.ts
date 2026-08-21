import { NextRequest } from "next/server";
import { UI_MESSAGE_STREAM_HEADERS } from "ai";
import { getCurrentUserId } from "@/lib/auth/session";
import { getAgentRunService } from "@/lib/agent/infrastructure";
import { createAgentEventTranslator } from "@/lib/agent/ui-stream";
import { isTerminalStatus, toClientEvent, uiSseFrame } from "@/lib/agent/sse-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdContext = { params: Promise<{ id: string }> };

function parseSequence(value: string | null, fallback: number): number | null {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * GET /api/runs/[id]/stream?after=sequence
 *
 * The AI SDK reconnect counterpart to `/api/chat`'s POST: same durable
 * replay + subscribe the SSE stream already uses, but for an existing run
 * instead of submitting a new one, and always framed as UIMessageChunks —
 * this route exists specifically for `useChat`'s `prepareReconnectToStreamRequest`,
 * which needs an actual UI-message-chunk stream to resume into, not the
 * JSON snapshot `/api/runs/[id]/events` returns for the legacy client.
 */
export async function GET(request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: runId } = await context.params;
  const after = parseSequence(
    request.nextUrl.searchParams.get("after") ?? request.headers.get("last-event-id"),
    0,
  );
  if (after === null) {
    return Response.json({ error: "Invalid event cursor" }, { status: 400 });
  }

  const service = getAgentRunService();
  const run = await service.coordinator.getRun(runId);
  if (!run || run.userId !== userId) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const translateEvent = createAgentEventTranslator();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let lastSequence = after;
      let flushing = false;
      let flushAgain = false;

      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        request.signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          /* reader may have already gone away */
        }
      };

      const emit = (event: ReturnType<typeof toClientEvent>, sequence?: number) => {
        if (closed || !event) return;
        try {
          const frame = uiSseFrame(translateEvent(event), sequence);
          if (frame) controller.enqueue(encoder.encode(frame));
        } catch {
          close();
        }
      };

      const flush = async () => {
        if (flushing) {
          flushAgain = true;
          return;
        }
        flushing = true;
        try {
          do {
            flushAgain = false;
            const events = await service.coordinator.replay(runId, lastSequence);
            for (const event of events) {
              lastSequence = event.sequence;
              emit(toClientEvent(runId, event), event.sequence);
            }
            const current = await service.coordinator.getRun(runId);
            if (current && isTerminalStatus(current.status)) {
              close();
              return;
            }
          } while (flushAgain && !closed);
        } catch {
          close();
        } finally {
          flushing = false;
        }
      };

      const onAbort = () => close();
      const unsubscribe = service.coordinator.subscribe(runId, () => {
        void flush();
      });
      request.signal.addEventListener("abort", onAbort, { once: true });
      void flush();
    },
    cancel() {
      /* onAbort above already tears down the subscription */
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      ...UI_MESSAGE_STREAM_HEADERS,
      "X-Accel-Buffering": "no",
    },
  });
}
