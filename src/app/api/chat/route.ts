import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import type { AgentSseEvent } from "@/lib/agent/types";
import { runAgentTurn } from "@/lib/agent/runtime";
import { webStore } from "@/lib/host/web/store-singleton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function userIdFromRequest(request: NextRequest): string | null {
  const fromHeader = request.headers.get("x-winlume-user")?.trim();
  return fromHeader || null;
}

function sseFrame(event: AgentSseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

type ChatBody = {
  sessionId?: string;
  message?: string;
  model?: string;
  skillIds?: string[];
};

/**
 * POST /api/chat — stream one agent turn as SSE (AgentSseEvent).
 * Body: { sessionId?, message, model?, skillIds? }
 * Creates a session when sessionId is omitted.
 */
export async function POST(request: NextRequest) {
  const userId = userIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : undefined;
  const skillIds = Array.isArray(body.skillIds)
    ? body.skillIds.filter((id): id is string => typeof id === "string")
    : undefined;

  let sessionId =
    typeof body.sessionId === "string" && body.sessionId.trim()
      ? body.sessionId.trim()
      : "";

  if (!sessionId) {
    const session = await webStore.sessions.createSession({
      id: randomUUID(),
      userId,
      title: "新对话",
      model: model ?? "gpt-4o-mini",
    });
    sessionId = session.id;
  } else {
    const existing = await webStore.sessions.getSession(userId, sessionId);
    if (!existing) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }
  }

  const signal = request.signal;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (event: AgentSseEvent) => {
        try {
          controller.enqueue(encoder.encode(sseFrame(event)));
        } catch {
          /* client gone */
        }
      };

      try {
        for await (const event of runAgentTurn({
          userId,
          sessionId,
          userText: message,
          skillIds,
          model,
          sessions: webStore.sessions,
          artifacts: webStore.artifacts,
          signal,
          gatewayUserId: userId,
        })) {
          if (signal.aborted) {
            enqueue({ type: "done", reason: "cancelled" });
            break;
          }
          enqueue(event);
        }
      } catch (err) {
        if (signal.aborted) {
          enqueue({ type: "done", reason: "cancelled" });
        } else {
          const msg =
            err instanceof Error ? err.message : "Chat stream failed";
          enqueue({ type: "error", message: msg, code: "stream_error" });
          enqueue({ type: "done", reason: "error" });
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
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
