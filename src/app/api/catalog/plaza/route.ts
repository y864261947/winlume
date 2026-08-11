import { NextResponse } from "next/server";
import { getGatewayBaseUrl } from "@/lib/agent/provider/gateway";
import { getAuthMode } from "@/lib/platform/auth";
import { inferVendorFromModel, PLAZA_VENDORS } from "@/lib/catalog/vendors";
import type { PlazaModel } from "@/lib/catalog";

type NativeModelsPayload = {
  data?: Array<{ id?: unknown; owned_by?: unknown }>;
};

function trimUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function plazaResponse(
  models: PlazaModel[],
  vendors: Array<{ id: number; name: string; key?: string; logo?: string }>,
) {
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
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ success: false, message: "模型广场暂时不可访问。" }, { status: 502 });
  }
}

/**
 * List models from new-api (via getGatewayBaseUrl: REIZO_GATEWAY_URL → NEW_API_URL → localhost).
 * Pricing-catalog tables were dropped with the billing engine; prices come from new-api when available.
 */
async function modelsPlaza(): Promise<Response> {
  const gatewayUrl = getGatewayBaseUrl();
  const adminToken = process.env.NEW_API_ADMIN_TOKEN?.trim();
  const headers: Record<string, string> = {};
  if (adminToken) {
    headers.Authorization = `Bearer ${adminToken}`;
  }

  try {
    const upstream = await fetch(`${gatewayUrl}/v1/models`, {
      headers,
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json({ success: false, message: "Reizo 模型目录暂时不可访问。" }, { status: 502 });
    }
    const payload = (await upstream.json().catch(() => null)) as NativeModelsPayload | null;
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const models: PlazaModel[] = rows.flatMap((row) => {
      const modelName = typeof row.id === "string" ? row.id.trim() : "";
      if (!modelName) return [];
      const vendor = inferVendorFromModel(modelName);
      return [
        {
          model_name: modelName,
          vendor_id: vendor.id,
          vendor_key: vendor.key,
          vendor_name: vendor.name,
          vendor_logo: vendor.logo,
          quota_type: 0,
          model_price: 0,
          model_ratio: 1,
          completion_ratio: 1,
          supported_endpoint_types: ["openai"],
        },
      ];
    });
    return plazaResponse(
      models,
      PLAZA_VENDORS.map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        key: vendor.key,
        logo: vendor.logo,
      })),
    );
  } catch {
    return NextResponse.json({ success: false, message: "Reizo 模型目录暂时不可访问。" }, { status: 502 });
  }
}

export async function GET() {
  return getAuthMode() === "legacy" ? legacyPlaza() : modelsPlaza();
}
