import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { webStore } from "@/lib/host/web/store-singleton";

/** GET /api/sessions — list sessions for the authenticated user */
export async function GET(_request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await webStore.sessions.listSessions(userId);
  return NextResponse.json({ sessions });
}

/** POST /api/sessions — create a session; body: { model?, title? } */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { model?: string; title?: string } = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text) as { model?: string; title?: string };
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const session = await webStore.sessions.createSession({
    id: randomUUID(),
    userId,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "新对话",
    model:
      typeof body.model === "string" && body.model.trim()
        ? body.model.trim()
        : "gpt-4o-mini",
  });

  return NextResponse.json(session, { status: 201 });
}
