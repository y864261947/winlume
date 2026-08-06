import { requireGatewayAdminContext, gatewayAdminFetch, gatewayAdminJson, gatewayAdminErrorResponse } from "@/lib/gateway-admin/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireGatewayAdminContext();
    const { id } = await context.params;
    const upstream = await gatewayAdminFetch(`/internal/admin/service-accounts/${id}/revoke`, { method: "POST" });
    const body = await upstream.json();
    return gatewayAdminJson(body, { status: upstream.status });
  } catch (error) {
    return gatewayAdminErrorResponse(error);
  }
}
