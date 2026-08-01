import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import type { Project } from "@/lib/agent/types";
import { webStore } from "@/lib/host/web/store-singleton";

type IdContext = { params: Promise<{ id: string }> };

function toPublicProject(project: Project): Omit<Project, "userId"> {
  const publicProject = { ...project };
  delete publicProject.userId;
  return publicProject;
}

export async function GET(_request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  let project;
  try {
    project = await webStore.projects.getProject(userId, id);
  } catch {
    project = null;
  }
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json(toPublicProject(project));
}

export async function PATCH(request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const patch: {
    name?: string;
    description?: string | null;
    instructions?: string | null;
    pinnedSkillIds?: string[];
  } = {};
  if (typeof input.name === "string" && input.name.trim()) patch.name = input.name.trim();
  if (input.description === null) patch.description = null;
  if (typeof input.description === "string") patch.description = input.description.trim();
  if (input.instructions === null) patch.instructions = null;
  if (typeof input.instructions === "string") patch.instructions = input.instructions.trim();
  if (Array.isArray(input.pinnedSkillIds)) {
    patch.pinnedSkillIds = input.pinnedSkillIds
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim()).filter(Boolean).slice(0, 8);
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      toPublicProject(await webStore.projects.updateProject(userId, id, patch)),
    );
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
}

export async function DELETE(_request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  let existing;
  try {
    existing = await webStore.projects.getProject(userId, id);
  } catch {
    existing = null;
  }
  if (!existing) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  try {
    await webStore.projects.deleteProject(userId, id);
  } catch {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
