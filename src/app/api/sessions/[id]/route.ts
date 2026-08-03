import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { webStore } from "@/lib/host/web/store-singleton";

type IdContext = { params: Promise<{ id: string }> };

/** GET /api/sessions/[id] — { session, messages } */
export async function GET(request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
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

/** PATCH /api/sessions/[id] — { title?, model?, projectId?, pinnedSkillIds? } */
export async function PATCH(request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: {
    title?: string;
    model?: string;
    projectId?: string | null;
    pinnedSkillIds?: string[];
    capabilityPresetId?: unknown;
  } = {};
  try {
    const text = await request.text();
    if (text.trim()) {
      body = JSON.parse(text) as {
        title?: string;
        model?: string;
        projectId?: string | null;
        pinnedSkillIds?: string[];
        capabilityPresetId?: unknown;
      };
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: {
    title?: string;
    model?: string;
    pinnedSkillIds?: string[];
    projectId?: string | null;
    capabilityPresetId?: string | null;
  } = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.model === "string") patch.model = body.model;
  if (body.projectId === null) patch.projectId = null;
  else if (typeof body.projectId === "string") {
    const projectId = body.projectId.trim();
    if (projectId) {
      const project = await webStore.projects.getProject(userId, projectId);
      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }
      patch.projectId = projectId;
    }
  }
  if (Array.isArray(body.pinnedSkillIds)) {
    const ids = body.pinnedSkillIds
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    patch.pinnedSkillIds = ids;
  }
  if (Object.hasOwn(body, "capabilityPresetId")) {
    if (body.capabilityPresetId !== null) {
      return NextResponse.json(
        { error: "Capability preset can only be cleared" },
        { status: 400 },
      );
    }
    patch.capabilityPresetId = null;
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
  const userId = await getCurrentUserId();
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
