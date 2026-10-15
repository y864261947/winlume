import { NextResponse } from "next/server";
import { getGatewayBaseUrl } from "@/lib/agent/provider/gateway";
import { getCurrentUserId } from "@/lib/auth/session";
import { resolveStudioToken } from "@/lib/agent/provider/studio-token";
import { getAuthMode } from "@/lib/platform/auth";
import { inferVendorFromModel, PLAZA_VENDORS } from "@/lib/catalog/vendors";
import type { PlazaModel } from "@/lib/catalog";
import { getPublicPortalContent } from "@/lib/portal/content-config";
import { publishedCatalog } from "@/lib/portal/published-catalog";
import { PlatformAdminError, requirePlatformAdmin } from "@/lib/platform/admin";
import { applyActualPricing, readNewApiPricing } from "@/lib/newapi/pricing";

type NativeModelsPayload = {
  data?: Array<{ id?: unknown; owned_by?: unknown }>;
};

/**
 * There is deliberately NO hard-coded model list here.
 *
 * A 53-entry `FALLBACK_MODELS` constant used to live at this spot, meant to
 * keep the directory useful while the gateway was down. Audited against the
 * live relay on 2026-09-19, 49 of its 53 names were not servable by any
 * enabled channel — `dall-e-3`, `veo-3`, `imagen-4`, `flux-1.1-pro` and the
 * rest had never been connected. It was sample data that had aged into a
 * catalogue by sitting still.
 *
 * It fed `?scope=admin-import`, which is precisely where it did damage: an
 * admin importing the "full catalogue" was offered 49 models that cannot be
 * served. An empty list is a visibly broken gateway; a list of plausible
 * ghosts is a silently wrong one, and only the second reaches a customer.
 *
 * The public page is unaffected either way — it renders the
 * `portal_content.modelVendors` allowlist through `publishedCatalog()`.
 *
 * Keep the relay as the only source of truth. `npm run catalog:audit`
 * diffs it against the portal allowlist and emits importable rows.
 */

async function fallbackPlaza() {
  const models = await mergePortalManagedModels([]);
  return plazaResponse(models, PLAZA_VENDORS.map((vendor) => ({
    id: vendor.id, name: vendor.name, key: vendor.key, logo: vendor.logo,
  })));
}


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

async function mergePortalManagedModels(models: PlazaModel[]) {
  const content = await getPublicPortalContent();
  const known = new Set(models.map((model) => model.model_name.trim().toLowerCase()));
  const managed = content.modelVendors
    .filter((vendor) => vendor.enabled)
    .flatMap((vendor) => vendor.models.map((model) => ({
      model_name: model.name,
      portal_category: vendor.category,
      vendor_key: vendor.key,
      vendor_name: vendor.name,
      vendor_logo: vendor.logoUrl,
      quota_type: ["images", "video", "audio"].some((type) => model.endpointTypes.includes(type)) ? 1 : 0,
      model_price: 0,
      model_ratio: 1,
      completion_ratio: 1,
      supported_endpoint_types: model.endpointTypes,
    } satisfies PlazaModel)))
    .filter((model) => !known.has(model.model_name.toLowerCase()));
  return [...models, ...managed];
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
  let authToken =
    process.env.REIZO_SERVICE_KEY?.trim() ||
    process.env.REIZO_GATEWAY_TOKEN?.trim() ||
    process.env.NEW_API_ADMIN_TOKEN?.trim() ||
    "";
  const userId = await getCurrentUserId();
  if (userId) {
    try {
      authToken = await resolveStudioToken(userId);
    } catch {
      // Fall back to the server-level token for unauthenticated/public callers.
    }
  }
  const headers: Record<string, string> = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
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
      await mergePortalManagedModels(models),
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

export async function GET(request: Request) {
  const isImport = new URL(request.url).searchParams.get("scope") === "admin-import";
  if (!isImport) {
    const [content, pricing] = await Promise.all([
      getPublicPortalContent(), readNewApiPricing().catch(() => null),
    ]);
    const models = publishedCatalog(pricing?.models ?? [], content.modelVendors);
    return plazaResponse(pricing ? applyActualPricing(models, pricing) : models.map(model => ({ ...model, pricing_unavailable: true })), []);
  }
  if (isImport) {
    try { await requirePlatformAdmin(); }
    catch (error) {
      return NextResponse.json({ success: false, message: "仅管理员可导入完整目录。" }, { status: error instanceof PlatformAdminError ? error.status : 500 });
    }
  }
  const response = await (getAuthMode() === "legacy" ? legacyPlaza() : modelsPlaza());
  // The directory is public product content. A temporarily unavailable gateway
  // must not erase its vendor and model information from the client.
  const catalog = response.ok ? response : await fallbackPlaza();
  return catalog;
}
