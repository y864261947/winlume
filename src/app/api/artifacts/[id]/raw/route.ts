import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { webStore } from "@/lib/host/web/store-singleton";

type IdContext = { params: Promise<{ id: string }> };

/**
 * GET /api/artifacts/[id]/raw — raw bytes with the artifact's real
 * mimeType, for direct use as an <img src> (or any binary download).
 */
export async function GET(request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
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
  if (!buf || buf.length === 0) {
    return NextResponse.json({ error: "Artifact content not ready" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": artifact.mimeType || "application/octet-stream",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
