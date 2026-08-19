import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { webStore } from "@/lib/host/web/store-singleton";
import {
  isSupportedReferenceVideoMime,
  MAX_REFERENCE_VIDEO_BYTES,
} from "@/lib/studio/video-upload";
import { parseArtifactName, requestContentLength } from "@/lib/studio/upload-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_VIDEO_BYTES = MAX_REFERENCE_VIDEO_BYTES;

/**
 * Store a video as raw request bytes. Using a raw body rather than formData
 * keeps the browser upload streaming and avoids buffering large media in the
 * Next.js process.
 */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = request.body;
  const sessionId = request.headers.get("x-reizo-session-id")?.trim() ?? "";
  const name = parseArtifactName(request.headers.get("x-reizo-artifact-name"));
  const confirmed = request.headers.get("x-reizo-video-authorized") === "true";
  const mimeType = request.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase() ?? "";
  const length = requestContentLength(request);

  if (!sessionId || !name || !confirmed || !isSupportedReferenceVideoMime(mimeType) || !body) {
    return NextResponse.json(
      { error: "sessionId, authorized video name, supported content type, and bytes are required" },
      { status: 400 },
    );
  }
  if (length !== null && length > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      { error: `视频超过 ${Math.floor(MAX_VIDEO_BYTES / 1024 / 1024)} MB 上限` },
      { status: 413 },
    );
  }

  const session = await webStore.sessions.getSession(userId, sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const artifactId = randomUUID();
  try {
    const artifact = await webStore.artifacts.writeStream(
      {
        id: artifactId,
        userId,
        sessionId,
        ...(session.projectId ? { projectId: session.projectId } : {}),
        name,
        kind: "video",
        mimeType,
        storageKey: "",
        status: "ready",
        createdAt: new Date().toISOString(),
      },
      Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
      { maxBytes: MAX_VIDEO_BYTES },
    );
    return NextResponse.json({ artifact });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video upload failed";
    const status = message.includes("exceeds") ? 413 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
