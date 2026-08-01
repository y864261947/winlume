import { NextResponse } from "next/server";
import { getAuthMode } from "@/lib/platform/auth";

type NativeModelsPayload = {
  data?: Array<{ id?: unknown; owned_by?: unknown }>;
};

function trimUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function plazaResponse(models: Array<Record<string, unknown>>, vendors: Array<{ id: number; name: string }>) {
  return NextResponse.json(
    { success: true, data: models, vendors },
    { headers: { "cache-control": "no-store" } },
  );
}

async function legacyPlaza(): Promise<Response> {
  const gatewayUrl = process.env.NEW_API_URL?.trim();
  if (!gatewayUrl) {
    return NextResponse.json({ success: false, message: "旧模型广场未配置。" }, { status: 503 });
  }
  try {
    const upstream = await fetch(`${trimUrl(gatewayUrl)}/api/pricing`, { cache: "no-store" });
    const body = await upstream.text();
    return new NextResponse(body || JSON.stringify({ success: false, message: "模型广场暂时没有返回数据。" }), {
      status: body ? upstream.status : 502,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json", "cache-control": "no-store" },
    });
  } catch {
    return NextResponse.json({ success: false, message: "模型广场暂时不可访问。" }, { status: 502 });
  }
}

async function nativePlaza(): Promise<Response> {
  const gatewayUrl = trimUrl(process.env.WINLUME_GATEWAY_URL ?? "http://127.0.0.1:4010");
  const internalToken = process.env.WINLUME_GATEWAY_INTERNAL_TOKEN?.trim();
  if (!internalToken) {
    return NextResponse.json({ success: false, message: "WinLume 模型目录尚未配置。" }, { status: 503 });
  }

  try {
    const upstream = await fetch(`${gatewayUrl}/v1/models`, {
      headers: { "x-winlume-internal-token": internalToken },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json({ success: false, message: "WinLume 模型目录暂时不可访问。" }, { status: 502 });
    }
    const payload = (await upstream.json().catch(() => null)) as NativeModelsPayload | null;
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const models = rows.flatMap((row) => {
      const modelName = typeof row.id === "string" ? row.id.trim() : "";
      if (!modelName) return [];
      return [{
        model_name: modelName,
        vendor_id: 1,
        quota_type: 0,
        model_price: 0,
        model_ratio: 1,
        completion_ratio: 1,
        supported_endpoint_types: ["openai"],
      }];
    });
    return plazaResponse(models, [{ id: 1, name: "WinLume Gateway" }]);
  } catch {
    return NextResponse.json({ success: false, message: "WinLume 模型目录暂时不可访问。" }, { status: 502 });
  }
}

export async function GET() {
  return getAuthMode() === "legacy" ? legacyPlaza() : nativePlaza();
}
