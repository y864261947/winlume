import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { parseCanvasContent } from "@/lib/agent/canvas-content";
import { publishArtifactEvent } from "@/lib/agent/artifact-events";
import { webStore } from "@/lib/host/web/store-singleton";

type IdContext = { params: Promise<{ id: string }> };

/**
 * GET /api/artifacts/[id] — metadata + utf-8 content for one artifact (user-scoped).
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

  const isBinaryKind = artifact.kind === "image" || artifact.kind === "binary";
  const buf = isBinaryKind ? null : await webStore.artifacts.readContent(userId, id);
  const content = isBinaryKind ? null : buf ? buf.toString("utf8") : "";

  return NextResponse.json({ artifact, content });
}

/**
 * PUT /api/artifacts/[id] — auto-save endpoint for canvas artifacts only.
 * Accepts serialized canvas content after a conversion/edit, or records a
 * client-side conversion failure so opened views can render a stable error.
 */
export async function PUT(request: NextRequest, context: IdContext) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Missing artifact id" }, { status: 400 });
  }

  const existing = await webStore.artifacts.get(userId, id);
  if (!existing) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }
  if (existing.kind !== "canvas") {
    return NextResponse.json(
      { error: "Only canvas artifacts can be updated via this endpoint" },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "JSON body must be an object" }, { status: 400 });
  }

  const canvasUpdate = body as { status?: unknown; error?: unknown; content?: unknown };
  if (canvasUpdate.status === "failed") {
    const errorMessage = canvasUpdate.error;
    if (typeof errorMessage !== "string" || !errorMessage.trim()) {
      return NextResponse.json({ error: "Missing error message" }, { status: 400 });
    }

    const currentContent = await webStore.artifacts.readContent(userId, id);
    const updated = await webStore.artifacts.write(
      { ...existing, status: "failed", error: errorMessage.trim() },
      currentContent ?? Buffer.alloc(0),
    );
    publishArtifactEvent(userId, {
      type: "artifact_updated",
      artifactId: id,
      status: "failed",
      error: updated.error,
    });
    return NextResponse.json({ artifact: updated });
  }

  const serializedContent = canvasUpdate.content;
  if (typeof serializedContent !== "string") {
    return NextResponse.json({ error: "Invalid canvas content" }, { status: 400 });
  }
  const incoming = parseCanvasContent(serializedContent);
  if (!incoming) {
    return NextResponse.json({ error: "Invalid canvas content" }, { status: 400 });
  }

  // A delayed autosave from an older Excalidraw scene must never overwrite a
  // newer Mermaid revision written by the agent.
  const currentBuffer = await webStore.artifacts.readContent(userId, id);
  const current = currentBuffer ? parseCanvasContent(currentBuffer.toString("utf8")) : null;
  if (current && current.mermaidSource !== incoming.mermaidSource) {
    return NextResponse.json(
      { error: "Canvas source changed; reload before saving again" },
      { status: 409 },
    );
  }

  const updated = await webStore.artifacts.write(
    { ...existing, status: "ready", error: undefined },
    serializedContent,
  );
  publishArtifactEvent(userId, {
    type: "artifact_updated",
    artifactId: id,
    status: "ready",
  });
  return NextResponse.json({ artifact: updated });
}
