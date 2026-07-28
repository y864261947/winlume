import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import type { AgentSseEvent } from "@/lib/agent/types";
import { runAgentTurn } from "@/lib/agent/runtime";
import {
  registerTurn,
  unregisterTurn,
} from "@/lib/agent/turn-registry";
import { webStore } from "@/lib/host/web/store-singleton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseFrame(event: AgentSseEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

type ChatBody = {
  sessionId?: string;
  message?: string;
  model?: string;
  skillIds?: string[];
  referencedArtifactId?: string;
};

/**
 * POST /api/chat — stream one agent turn as SSE (AgentSseEvent).
 * Body: { sessionId?, message, model?, skillIds?, referencedArtifactId? }
 *
 * Client disconnect does NOT cancel the turn (generation continues server-side).
 * Explicit stop: POST /api/chat/stop { sessionId }.
 */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
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
  const referencedArtifactId =
    typeof body.referencedArtifactId === "string" && body.referencedArtifactId.trim()
      ? body.referencedArtifactId.trim()
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

  const turn = registerTurn(sessionId, userId);
  if (!turn) {
    return Response.json(
      { error: "该会话已有进行中的回复，请稍候或先停止" },
      { status: 409 },
    );
  }

  const clientSignal = request.signal;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let clientGone = clientSignal.aborted;
      const onClientAbort = () => {
        clientGone = true;
      };
      clientSignal.addEventListener("abort", onClientAbort);

      const enqueue = (event: AgentSseEvent) => {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(sseFrame(event)));
        } catch {
          clientGone = true;
        }
      };

      try {
        // Use turn.controller only — NOT client disconnect — so refresh/leave
        // does not kill generation. Stop button hits /api/chat/stop.
        for await (const event of runAgentTurn({
          userId,
          sessionId,
          userText: message,
          skillIds,
          referencedArtifactId,
          model,
          sessions: webStore.sessions,
          artifacts: webStore.artifacts,
          signal: turn.controller.signal,
          gatewayUserId: userId,
        })) {
          enqueue(event);
        }
      } catch (err) {
        if (turn.controller.signal.aborted) {
          enqueue({ type: "done", reason: "cancelled" });
        } else {
          const msg =
            err instanceof Error ? err.message : "Chat stream failed";
          enqueue({ type: "error", message: msg, code: "stream_error" });
          enqueue({ type: "done", reason: "error" });
        }
      } finally {
        clientSignal.removeEventListener("abort", onClientAbort);
        unregisterTurn(sessionId, turn.controller);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      // Reader cancelled (client navigated/closed stream) — do NOT abort turn.
      // Generation keeps running; results persist to session store.
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
