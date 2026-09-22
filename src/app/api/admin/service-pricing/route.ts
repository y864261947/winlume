import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin, PlatformAdminError } from "@/lib/platform/admin";
import { isPriceId } from "@/lib/service-pricing/catalog";
import { PricingError } from "@/lib/service-pricing/config";
import { readPrices, savePrice } from "@/lib/service-pricing/store";
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store" };
function failure(e: unknown) { return NextResponse.json({ error: e instanceof PricingError || e instanceof PlatformAdminError ? e.message : "定价配置暂不可用，请稍后重试。" }, { status: e instanceof PricingError || e instanceof PlatformAdminError ? e.status : 503, headers }); }
export async function GET() { try { await requirePlatformAdmin(); return NextResponse.json({ prices: await readPrices() }, { headers }); } catch(e) { return failure(e); } }
export async function PUT(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new PricingError("不允许跨站操作。", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new PricingError("请使用 JSON 请求。", 415);
    const raw = await request.text();
    if (raw.length > 6000) throw new PricingError("请求内容过长。", 413);
    let data; try { data = JSON.parse(raw); } catch { throw new PricingError("请求格式不正确。"); }
    if (!isPriceId(data?.id)) throw new PricingError("未知服务。");
    return NextResponse.json({ price: await savePrice(data.id, data.config) }, { headers });
  } catch(e) { return failure(e); }
}
