import { NextRequest, NextResponse } from "next/server";
import { PlatformAdminError, requirePlatformAdmin } from "@/lib/platform/admin";
import { getPlatformRepositories } from "@/lib/platform/repositories";
import { getPortalContent, normalizePortalContent, PORTAL_CONTENT_KEY } from "@/lib/portal/content-config";

function errorResponse(error: unknown) {
  if (error instanceof PlatformAdminError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("[admin/portal-content]", error);
  return NextResponse.json({ error: "门户内容保存失败" }, { status: 500 });
}

export async function GET() {
  try { await requirePlatformAdmin(); return NextResponse.json(await getPortalContent()); }
  catch (error) { return errorResponse(error); }
}

export async function PUT(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    const repositories = getPlatformRepositories();
    if (!repositories) return NextResponse.json({ error: "平台数据库尚未配置。" }, { status: 503 });
    const value = normalizePortalContent(await request.json().catch(() => ({})));
    await repositories.portalContent.set(PORTAL_CONTENT_KEY, value as unknown as Record<string, unknown>);
    return NextResponse.json(value);
  } catch (error) { return errorResponse(error); }
}
