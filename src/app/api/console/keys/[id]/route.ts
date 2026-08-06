import {
  ConsoleRequestError,
  consoleError,
  consoleJson,
  ensureOrganizationKeyManager,
  mapConsoleApiKey,
  requireConsoleContext,
} from "@/lib/console/server";
import { requireConsoleOrganization } from "@/lib/console/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const requestContext = await requireConsoleContext();
    const key = await requestContext.repositories.apiKeys.findById(id);
    if (!key) {
      throw new ConsoleRequestError("未找到该 API Key。", 404, "api_key_not_found");
    }
    if (key.organizationId) {
      // Org-owned key: caller must be an owner/admin of that organization.
      const selected = await requireConsoleOrganization(requestContext, key.organizationId);
      ensureOrganizationKeyManager(selected.membership.role);
    } else if (key.userId !== requestContext.userId) {
      // Personal key: only the creator can revoke it.
      throw new ConsoleRequestError("未找到该 API Key。", 404, "api_key_not_found");
    }
    const revoked = await requestContext.repositories.apiKeys.revoke(id);
    if (!revoked) throw new ConsoleRequestError("未找到该 API Key。", 404, "api_key_not_found");
    return consoleJson({ key: mapConsoleApiKey(revoked) });
  } catch (error) {
    return consoleError(error);
  }
}
