import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import type { Project } from "@/lib/agent/types";
import { webStore } from "@/lib/host/web/store-singleton";

function toPublicProject(project: Project): Omit<Project, "userId"> {
  const publicProject = { ...project };
  delete publicProject.userId;
  return publicProject;
}

/** GET /api/projects - list projects owned by the authenticated user. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projects = await webStore.projects.listProjects(userId);
  return NextResponse.json({ projects: projects.map(toPublicProject) });
}

/** POST /api/projects - body: { name, description?, instructions?, pinnedSkillIds? }. */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return NextResponse.json({ error: "Project name is required" }, { status: 400 });

  const pinnedSkillIds = Array.isArray(input.pinnedSkillIds)
    ? input.pinnedSkillIds.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean).slice(0, 8)
    : undefined;
  const project = await webStore.projects.createProject({
    id: randomUUID(),
    userId,
    name,
    ...(typeof input.description === "string" ? { description: input.description.trim() } : {}),
    ...(typeof input.instructions === "string" ? { instructions: input.instructions.trim() } : {}),
    ...(pinnedSkillIds !== undefined ? { pinnedSkillIds } : {}),
  });
  return NextResponse.json(toPublicProject(project), { status: 201 });
}
