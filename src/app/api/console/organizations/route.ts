import { consoleError, consoleJson, requireConsoleContext } from "@/lib/console/server";
import { listConsoleOrganizations } from "@/lib/console/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lightweight workspace resolution: organizations + the active organizationId,
 * without the API-key list and per-owner-name lookups /api/console/keys does.
 * Pages that only need "which workspace is selected" (usage logs, enterprise
 * billing) should use this instead of piggybacking on the keys endpoint.
 */
export async function GET(request: Request) {
  try {
    const context = await requireConsoleContext();
    const organizations = await listConsoleOrganizations(context);
    const requested = new URL(request.url).searchParams.get("organizationId") || null;
    const platformUser = requested ? null : await context.repositories.users.findById(context.userId);
    const currentOrganizationId = platformUser?.currentOrganizationId ?? null;
    const organizationId = requested
      ?? (currentOrganizationId && organizations.some((organization) => organization.id === currentOrganizationId)
        ? currentOrganizationId
        : organizations[0]?.id ?? null);
    return consoleJson({ organizations, organizationId });
  } catch (error) {
    return consoleError(error);
  }
}
