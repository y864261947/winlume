import { NextRequest, NextResponse } from "next/server";
import { webStore } from "@/lib/host/web/store-singleton";

function userIdFromRequest(request: NextRequest): string | null {
  const fromHeader = request.headers.get("x-winlume-user")?.trim();
  return fromHeader || null;
}

/**
 * GET /api/artifacts — list artifacts for the authenticated user.
 * Query: ?sessionId= optional filter to one session.
 */
export async function GET(request: NextRequest) {
  const userId = userIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim();
  const artifacts = sessionId
    ? await webStore.artifacts.listBySession(userId, sessionId)
    : await webStore.artifacts.listByUser(userId);

  // Newest first
  const sorted = [...artifacts].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );

  return NextResponse.json({ artifacts: sorted });
}
