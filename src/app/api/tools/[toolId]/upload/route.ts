import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { webStore } from "@/lib/host/web/store-singleton";
import { MAX_IMAGE_BYTES, parseDataUrl } from "@/lib/studio/composer-attachments";
import {
  getStudioTool,
  isStudioToolImageMimeType,
  toolArtifactSessionId,
} from "@/lib/studio/tool-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ toolId: string }> };
type UploadToolImageBody = { name?: unknown; dataUrl?: unknown };

export async function POST(request: NextRequest, context: Context) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { toolId } = await context.params;
  const tool = getStudioTool(toolId);
  if (!tool) return NextResponse.json({ error: "工具不存在" }, { status: 404 });

  let body: UploadToolImageBody;
  try {
    body = (await request.json()) as UploadToolImageBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
  const parsed = parseDataUrl(dataUrl);
  if (
    !name ||
    !parsed ||
    !isStudioToolImageMimeType(parsed.mimeType)
  ) {
    return NextResponse.json({ error: "请选择一张有效的图片" }, { status: 400 });
  }
  if (parsed.bytes.length > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: `图片不能超过 ${MAX_IMAGE_BYTES / 1024 / 1024} MB` },
      { status: 400 },
    );
  }

  const artifact = await webStore.artifacts.write(
    {
      id: randomUUID(),
      userId,
      sessionId: toolArtifactSessionId(tool.id),
      name,
      kind: "image",
      mimeType: parsed.mimeType.toLowerCase(),
      storageKey: "",
      status: "ready",
      createdAt: new Date().toISOString(),
    },
    parsed.bytes,
  );
  return NextResponse.json({ artifact }, { status: 201 });
}
