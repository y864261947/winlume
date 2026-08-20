import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId } from "@/lib/auth/session";
import { parseSheetContent } from "@/lib/agent/sheet-content";
import { sheetContentToXlsxBuffer } from "@/lib/agent/sheet-xlsx";
import { webStore } from "@/lib/host/web/store-singleton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdContext = { params: Promise<{ id: string }> };

/**
 * GET /api/artifacts/[id]/xlsx — the sheet artifact rendered as a real
 * .xlsx, carrying over whatever styling its Univer snapshot has (import
 * formatting, plus anything edited since).
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
  if (!artifact || artifact.kind !== "sheet") {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  const buf = await webStore.artifacts.readContent(userId, id);
  const content = buf ? parseSheetContent(buf.toString("utf8")) : null;
  if (!content) {
    return NextResponse.json({ error: "Sheet content not ready" }, { status: 404 });
  }

  const xlsx = await sheetContentToXlsxBuffer(content);
  const filename = `${artifact.name.replace(/[\r\n"]/g, " ").trim() || "workbook"}.xlsx`;

  return new NextResponse(new Uint8Array(xlsx), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
