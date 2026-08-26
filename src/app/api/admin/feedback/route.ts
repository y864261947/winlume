import { NextRequest, NextResponse } from "next/server";
import { PlatformAdminError, requirePlatformAdmin } from "@/lib/platform/admin";
import { getPlatformRepositories } from "@/lib/platform/repositories";

function errorResponse(error: unknown) {
  if (error instanceof PlatformAdminError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error("[admin/feedback]", error);
  return NextResponse.json({ error: "加载反馈列表失败" }, { status: 500 });
}

export async function GET() {
  try {
    await requirePlatformAdmin();
    const repositories = getPlatformRepositories();
    if (!repositories) return NextResponse.json({ reports: [] });
    const reports = await repositories.feedback.listAll();
    return NextResponse.json({ reports });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    const repositories = getPlatformRepositories();
    if (!repositories) return NextResponse.json({ error: "平台数据库尚未配置。" }, { status: 503 });
    const body = (await request.json().catch(() => ({}))) as { id?: string; status?: string };
    const id = typeof body.id === "string" ? body.id : "";
    const status = body.status === "open" || body.status === "resolved" ? body.status : null;
    if (!id || !status) {
      return NextResponse.json({ error: "参数无效" }, { status: 400 });
    }
    const report = await repositories.feedback.updateStatus(id, status);
    if (!report) return NextResponse.json({ error: "反馈不存在" }, { status: 404 });
    return NextResponse.json({ report });
  } catch (error) {
    return errorResponse(error);
  }
}
