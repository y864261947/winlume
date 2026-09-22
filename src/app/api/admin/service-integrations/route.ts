import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin, PlatformAdminError } from "@/lib/platform/admin";
import { MissingEncryptionKeyError } from "@/lib/newapi/crypto";
import { isServiceId } from "@/lib/service-integrations/catalog";
import { ServiceConfigError } from "@/lib/service-integrations/config";
import { listServices, saveService, testService } from "@/lib/service-integrations/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" };
function fail(error: unknown) {
  if (error instanceof PlatformAdminError && error.status === 403) return NextResponse.json({ error: "仅平台管理员可以管理服务接入。" }, { status: 403, headers });
  if (error instanceof PlatformAdminError || error instanceof ServiceConfigError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof MissingEncryptionKeyError) return NextResponse.json({ error: "服务器尚未配置密钥加密，请设置 REIZO_TOKEN_ENCRYPTION_KEY。" }, { status: 503, headers });
  // Database errors can embed query parameters. Do not log raw errors here.
  return NextResponse.json({ error: "服务配置暂不可用，请检查数据库连接和迁移状态。" }, { status: 503, headers });
}
export async function GET() {
  try {
    await requirePlatformAdmin();
    return NextResponse.json({ services: await listServices() }, { headers });
  } catch (error) { return fail(error); }
}
export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new ServiceConfigError("不允许跨站操作。", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new ServiceConfigError("请使用 JSON 请求。", 415);
    const raw = await request.text();
    if (raw.length > 12_000) throw new ServiceConfigError("请求内容过长。", 413);
    let input;
    try { input = JSON.parse(raw); } catch { throw new ServiceConfigError("请求格式不正确。"); }
    if (!input || !isServiceId(input.id)) throw new ServiceConfigError("未知服务。");
    if (input.action === "save") return NextResponse.json({ service: await saveService(input.id, input.config) }, { headers });
    if (input.action === "test" && Number.isSafeInteger(input.revision) && input.revision >= 0) return NextResponse.json(await testService(input.id, input.revision), { headers });
    throw new ServiceConfigError("未知操作或无效版本。");
  } catch (error) { return fail(error); }
}
