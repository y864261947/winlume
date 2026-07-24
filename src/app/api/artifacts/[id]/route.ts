import { NextRequest, NextResponse } from "next/server";
import { webStore } from "@/lib/host/web/store-singleton";

function userIdFromRequest(request: NextRequest): string | null {
  const fromHeader = request.headers.get("x-winlume-user")?.trim();
  return fromHeader || null;
}

type IdContext = { params: Promise<{ id: string }> };

/**
 * GET /api/artifacts/[id] — metadata + utf-8 content for one artifact (user-scoped).
 */
export async function GET(request: NextRequest, context: IdContext) {
  const userId = userIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing artifact id" }, { status: 400 });
  }

  const artifact = await webStore.artifacts.get(userId, id);
  if (!artifact) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  const buf = await webStore.artifacts.readContent(userId, id);
  const content = buf ? buf.toString("utf8") : "";

  return NextResponse.json({ artifact, content });
}
