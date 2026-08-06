import { requireGatewayAdminContext, gatewayAdminFetch, gatewayAdminJson, gatewayAdminErrorResponse } from "@/lib/gateway-admin/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  try {
    await requireGatewayAdminContext();
    const upstream = await gatewayAdminFetch("/internal/admin/pricing/group-rules", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    });
    const body = await upstream.json();
    return gatewayAdminJson(body, { status: upstream.status });
  } catch (error) {
    return gatewayAdminErrorResponse(error);
  }
}
