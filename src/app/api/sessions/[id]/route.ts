import { NextRequest, NextResponse } from "next/server";
import { webStore } from "@/lib/host/web/store-singleton";

function userIdFromRequest(request: NextRequest): string | null {
  const fromHeader = request.headers.get("x-winlume-user")?.trim();
  return fromHeader || null;
}

type IdContext = { params: Promise<{ id: string }> };

/** GET /api/sessions/[id] — { session, messages } */
export async function GET(request: NextRequest, context: IdContext) {
  const userId = userIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const session = await webStore.sessions.getSession(userId, id);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const messages = await webStore.sessions.listMessages(userId, id);
  return NextResponse.json({ session, messages });
}

/** PATCH /api/sessions/[id] — { title?, model?, pinnedSkillIds? } */
export async function PATCH(request: NextRequest, context: IdContext) {
  const userId = userIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: { title?: string; model?: string; pinnedSkillIds?: string[] } = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text) as {
        title?: string;
        model?: string;
        pinnedSkillIds?: string[];
      };
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: {
    title?: string;
    model?: string;
    pinnedSkillIds?: string[];
  } = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.model === "string") patch.model = body.model;
  if (Array.isArray(body.pinnedSkillIds)) {
    const ids = body.pinnedSkillIds
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    patch.pinnedSkillIds = ids;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  try {
    const session = await webStore.sessions.updateSession(userId, id, patch);
    return NextResponse.json(session);
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
}

/** DELETE /api/sessions/[id] */
export async function DELETE(request: NextRequest, context: IdContext) {
  const userId = userIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await webStore.sessions.getSession(userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await webStore.sessions.deleteSession(userId, id);
  return new NextResponse(null, { status: 204 });
}
