import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { webStore } from "@/lib/host/web/store-singleton";

/**
 * GET /api/artifacts — list artifacts for the authenticated user.
 * Query: ?sessionId= optional filter to one session.
 */
export async function GET(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim();
  const artifacts = sessionId
    ? await webStore.artifacts.listBySession(userId, sessionId)
    : await webStore.artifacts.listByUser(userId);

  // Newest first
  const sorted = artifacts.filter((artifact) => artifact.visibility !== "hidden").sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return NextResponse.json({ artifacts: sorted });
}
