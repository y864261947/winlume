import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { webStore } from "@/lib/host/web/store-singleton";

/**
 * GET /api/artifacts — list artifacts for the authenticated user.
 * Query: ?sessionId= or ?projectId= optional ownership-scoped filter.
 */
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim();
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim();
  if (sessionId && projectId) {
    return NextResponse.json(
      { error: "Use either sessionId or projectId, not both" },
      { status: 400 },
    );
  }
  if (projectId) {
    const project = await webStore.projects.getProject(userId, projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }
  const artifacts = sessionId
    ? await webStore.artifacts.listBySession(userId, sessionId)
    : projectId
      ? await webStore.artifacts.listByProject(userId, projectId)
      : await webStore.artifacts.listByUser(userId);

  // Newest first
  const sorted = artifacts.filter((artifact) => artifact.visibility !== "hidden").sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return NextResponse.json({ artifacts: sorted });
}
