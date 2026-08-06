import { consoleError, consoleJson, getConsoleUsageByKey, requireConsoleContext } from "@/lib/console/server";
import { requireConsoleOrganization } from "@/lib/console/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const context = await requireConsoleContext();
    const organizationId = new URL(request.url).searchParams.get("organizationId") || null;
    if (organizationId) {
      // Throws 403/404 if the caller isn't a member of this organization.
      await requireConsoleOrganization(context, organizationId);
    }
    const items = await getConsoleUsageByKey(context, organizationId);
    return consoleJson({ items });
  } catch (error) {
    return consoleError(error);
  }
}
