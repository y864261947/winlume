import {
  ConsoleRequestError,
  consoleError,
  consoleJson,
  ensureOrganizationKeyManager,
  requireConsoleContext,
} from "@/lib/console/server";
import { buildUsageCharts } from "@/lib/console/usage-charts";
import { requireConsoleOrganization } from "@/lib/console/workspace";
import { decryptSecret } from "@/lib/newapi/crypto";
import { getUserQuotaDates } from "@/lib/newapi/team-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHART_WINDOW_DAYS = 14;

export async function GET(request: Request) {
  try {
    const context = await requireConsoleContext();
    const url = new URL(request.url);
    let organizationId = url.searchParams.get("organizationId");
    if (!organizationId) {
      const platformUser = await context.repositories.users.findById(context.userId);
      organizationId = platformUser?.currentOrganizationId ?? null;
    }
    if (!organizationId) {
      throw new ConsoleRequestError("请选择一个工作区。", 400, "organization_id_required");
    }

    const selected = await requireConsoleOrganization(context, organizationId);
    ensureOrganizationKeyManager(selected.membership.role);

    const mapping = await context.repositories.teamNewApiMapping.findByOrganizationId(organizationId);
    if (!mapping) {
      throw new ConsoleRequestError("工作区未关联额度账户。", 409, "team_mapping_missing");
    }

    const endTimestamp = Math.floor(Date.now() / 1000);
    const startTimestamp = endTimestamp - CHART_WINDOW_DAYS * 24 * 60 * 60;
    const rows = await getUserQuotaDates(decryptSecret(mapping.newApiPatCiphertext), {
      startTimestamp,
      endTimestamp,
    });
    const series = buildUsageCharts(rows, CHART_WINDOW_DAYS);

    return consoleJson({
      organizationId,
      periodStart: new Date(startTimestamp * 1000).toISOString(),
      periodEnd: new Date(endTimestamp * 1000).toISOString(),
      daily: series.daily,
      byModel: series.byModel,
    });
  } catch (error) {
    return consoleError(error);
  }
}
