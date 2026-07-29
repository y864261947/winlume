import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { webStore } from "@/lib/host/web/store-singleton";
import { MAX_IMAGE_BYTES, parseDataUrl } from "@/lib/studio/composer-attachments";

type UploadImageBody = {
  sessionId?: string;
  name?: string;
  dataUrl?: string;
};

export const runtime = "nodejs";

/** Persist a composer-uploaded image as an immediately ready Artifact. */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: UploadImageBody;
  try {
    body = (await request.json()) as UploadImageBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  if (!sessionId || !name || !dataUrl) {
    return NextResponse.json(
      { error: "sessionId, name, and dataUrl are required" },
      { status: 400 },
    );
  }

  const session = await webStore.sessions.getSession(userId, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const parsed = parseDataUrl(dataUrl);
  if (
    !parsed ||
    !/^image\/[a-z0-9][a-z0-9.+-]*$/i.test(parsed.mimeType) ||
    parsed.mimeType.toLowerCase() === "image/svg+xml"
  ) {
    return NextResponse.json({ error: "Invalid image data URL" }, { status: 400 });
  }
  if (parsed.bytes.length > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `Image exceeds ${MAX_IMAGE_BYTES} bytes` },
      { status: 400 },
    );
  }

  const artifact = await webStore.artifacts.write(
    {
      id: randomUUID(),
      userId,
      sessionId,
      name,
      kind: "image",
      mimeType: parsed.mimeType,
      storageKey: "",
      status: "ready",
      createdAt: new Date().toISOString(),
    },
    parsed.bytes,
  );

  return NextResponse.json({ artifact });
}
