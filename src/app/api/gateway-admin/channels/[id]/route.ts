import { requireGatewayAdminContext, gatewayAdminFetch, gatewayAdminJson, gatewayAdminErrorResponse } from "@/lib/gateway-admin/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireGatewayAdminContext();
    const { id } = await context.params;
    const upstream = await gatewayAdminFetch(`/internal/admin/channels/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    });
    const body = await upstream.json();
    return gatewayAdminJson(body, { status: upstream.status });
  } catch (error) {
    return gatewayAdminErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireGatewayAdminContext();
    const { id } = await context.params;
    const upstream = await gatewayAdminFetch(`/internal/admin/channels/${id}`, { method: "DELETE" });
    const body = await upstream.json();
    return gatewayAdminJson(body, { status: upstream.status });
  } catch (error) {
    return gatewayAdminErrorResponse(error);
  }
}
