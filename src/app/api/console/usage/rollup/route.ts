import { ConsoleRequestError, consoleError, consoleJson, getOrganizationUsageRollup, requireConsoleContext } from "@/lib/console/server";
import { requireConsoleOrganization } from "@/lib/console/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Org-only rollup: unlike /api/console/usage/by-key (which also supports the
// caller's personal workspace), a personal workspace has exactly one owner
// so a "rollup across every key" adds nothing beyond what by-key already
// shows. organizationId is required here.
export async function GET(request: Request) {
  try {
    const context = await requireConsoleContext();
    const organizationId = new URL(request.url).searchParams.get("organizationId") || null;
    if (!organizationId) {
      throw new ConsoleRequestError("请选择一个工作区。", 400, "organization_id_required");
    }
    // Throws 403/404 if the caller isn't a member of this organization.
    await requireConsoleOrganization(context, organizationId);
    const rollup = await getOrganizationUsageRollup(context, organizationId);
    return consoleJson(rollup);
  } catch (error) {
    return consoleError(error);
  }
}
