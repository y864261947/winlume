import { DEFAULT_QUOTA_PER_UNIT } from "@/lib/catalog/plaza-display";
import {
  ConsoleRequestError,
  consoleError,
  consoleJson,
  ensureOrganizationKeyManager,
  requireConsoleContext,
} from "@/lib/console/server";
import { requireConsoleOrganization } from "@/lib/console/workspace";
import { decryptSecret } from "@/lib/newapi/crypto";
import { redeemTeamCode } from "@/lib/newapi/team-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const context = await requireConsoleContext();
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ConsoleRequestError("请求内容无效。", 400, "invalid_request");
    }

    let organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
    if (!organizationId) {
      const platformUser = await context.repositories.users.findById(context.userId);
      organizationId = platformUser?.currentOrganizationId ?? "";
    }
    if (!organizationId) {
      throw new ConsoleRequestError("请选择一个工作区。", 400, "organization_id_required");
    }

    const selected = await requireConsoleOrganization(context, organizationId);
    ensureOrganizationKeyManager(selected.membership.role);

    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code || code.length > 128) {
      throw new ConsoleRequestError("兑换码无效。", 400, "invalid_redemption_code");
    }

    const mapping = await context.repositories.teamNewApiMapping.findByOrganizationId(organizationId);
    if (!mapping) {
      throw new ConsoleRequestError("工作区未关联额度账户。", 409, "team_mapping_missing");
    }

    const result = await redeemTeamCode(decryptSecret(mapping.newApiPatCiphertext), code);
    return consoleJson({
      organizationId,
      type: result.type,
      credits: result.quota == null ? null : result.quota / DEFAULT_QUOTA_PER_UNIT,
    });
  } catch (error) {
    return consoleError(error);
  }
}
