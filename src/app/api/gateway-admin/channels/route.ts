import { requireGatewayAdminContext, gatewayAdminFetch, gatewayAdminJson, gatewayAdminErrorResponse } from "@/lib/gateway-admin/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireGatewayAdminContext();
    const upstream = await gatewayAdminFetch("/internal/admin/channels");
    const body = await upstream.json();
    return gatewayAdminJson(body, { status: upstream.status });
  } catch (error) {
    return gatewayAdminErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireGatewayAdminContext();
    const upstream = await gatewayAdminFetch("/internal/admin/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text(),
    });
    const body = await upstream.json();
    return gatewayAdminJson(body, { status: upstream.status });
  } catch (error) {
    return gatewayAdminErrorResponse(error);
  }
}
