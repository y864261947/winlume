import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { SHEET_MIME, serializeSheetContent } from "@/lib/agent/sheet-content";
import {
  MAX_SHEET_UPLOAD_BYTES,
  isLegacyXlsFile,
  isSpreadsheetFile,
  workbookTitleFromFileName,
} from "@/lib/agent/sheet-file";
import { parseXlsxToSheetContent } from "@/lib/agent/sheet-xlsx";
import { publishArtifactEvent } from "@/lib/agent/artifact-events";
import { webStore } from "@/lib/host/web/store-singleton";
import { parseArtifactName, requestContentLength } from "@/lib/studio/upload-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reads a request body into memory, aborting as soon as `limit` bytes is exceeded. */
async function readBodyWithLimit(
  body: ReadableStream<Uint8Array>,
  limit: number,
): Promise<Buffer | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Import an uploaded .xlsx workbook as a ready sheet artifact.
 */
export async function POST(request: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = request.headers.get("x-reizo-session-id")?.trim() ?? "";
  const fileName = parseArtifactName(request.headers.get("x-reizo-artifact-name"));
  const mimeType = request.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";
  const length = requestContentLength(request);
  const body = request.body;

  if (!sessionId || !fileName || !body) {
    return NextResponse.json(
      { error: "sessionId, workbook name, and bytes are required" },
      { status: 400 },
    );
  }
  if (isLegacyXlsFile({ name: fileName, type: mimeType })) {
    return NextResponse.json(
      { error: "暂不支持旧版 .xls，请另存为 .xlsx 后再导入" },
      { status: 400 },
    );
  }
  if (!isSpreadsheetFile({ name: fileName, type: mimeType })) {
    return NextResponse.json({ error: "请上传 .xlsx 工作簿" }, { status: 400 });
  }
  if (length !== null && length > MAX_SHEET_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `表格超过 ${Math.floor(MAX_SHEET_UPLOAD_BYTES / 1024 / 1024)} MB 上限` },
      { status: 413 },
    );
  }

  const session = await webStore.sessions.getSession(userId, sessionId);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const bytes = await readBodyWithLimit(body, MAX_SHEET_UPLOAD_BYTES);
  if (bytes === null) {
    return NextResponse.json(
      { error: `表格超过 ${Math.floor(MAX_SHEET_UPLOAD_BYTES / 1024 / 1024)} MB 上限` },
      { status: 413 },
    );
  }
  if (!bytes.length) {
    return NextResponse.json({ error: "空文件无法导入" }, { status: 400 });
  }

  const parsed = await parseXlsxToSheetContent(bytes, fileName);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const artifact = await webStore.artifacts.write(
    {
      id: randomUUID(),
      userId,
      sessionId,
      ...(session.projectId ? { projectId: session.projectId } : {}),
      name: workbookTitleFromFileName(fileName),
      kind: "sheet",
      mimeType: SHEET_MIME,
      storageKey: "",
      status: "ready",
      createdAt: new Date().toISOString(),
    },
    serializeSheetContent(parsed.content),
  );
  publishArtifactEvent(userId, {
    type: "artifact_updated",
    artifactId: artifact.id,
    status: "ready",
  });
  return NextResponse.json({ artifact });
}
