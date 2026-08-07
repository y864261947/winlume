import { requireGatewayAdminContext, gatewayAdminFetch, gatewayAdminJson, gatewayAdminErrorResponse } from "@/lib/gateway-admin/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireGatewayAdminContext();
    const upstream = await gatewayAdminFetch("/internal/admin/model-availability");
    const body = await upstream.json();
    return gatewayAdminJson(body, { status: upstream.status });
  } catch (error) {
    return gatewayAdminErrorResponse(error);
  }
}
