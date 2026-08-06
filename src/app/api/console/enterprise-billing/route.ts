import {
  ConsoleRequestError,
  consoleError,
  consoleJson,
  getEnterpriseBillingRequestForOrg,
  requireConsoleContext,
  submitEnterpriseBillingRequest,
} from "@/lib/console/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function organizationIdFrom(searchParams: URLSearchParams): string {
  const organizationId = searchParams.get("organizationId");
  if (!organizationId) {
    throw new ConsoleRequestError("请先选择一个工作区。", 400, "invalid_organization_id");
  }
  return organizationId;
}

export async function GET(request: Request) {
  try {
    const context = await requireConsoleContext();
    const organizationId = organizationIdFrom(new URL(request.url).searchParams);
    const existing = await getEnterpriseBillingRequestForOrg(context, organizationId);
    return consoleJson({ request: existing });
  } catch (error) {
    return consoleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireConsoleContext();
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const organizationId = typeof body.organizationId === "string" && body.organizationId ? body.organizationId : null;
    if (!organizationId) {
      throw new ConsoleRequestError("请先选择一个工作区。", 400, "invalid_organization_id");
    }
    const created = await submitEnterpriseBillingRequest(context, organizationId, body);
    return consoleJson({ request: created }, { status: 201 });
  } catch (error) {
    return consoleError(error);
  }
}
