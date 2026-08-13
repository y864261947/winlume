import {
  ConsoleRequestError,
  consoleError,
  consoleJson,
  requireConsoleContext,
} from "@/lib/console/server";
import { mapUsageLog } from "@/lib/console/usage-logs";
import { requireConsoleOrganization } from "@/lib/console/workspace";
import { decryptSecret } from "@/lib/newapi/crypto";
import { getUserLogs } from "@/lib/newapi/team-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_TYPE_QUERY: Record<string, number> = {
  consume: 2,
  error: 5,
};

function positiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

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

    await requireConsoleOrganization(context, organizationId);

    const mapping = await context.repositories.teamNewApiMapping.findByOrganizationId(organizationId);
    if (!mapping) {
      throw new ConsoleRequestError("工作区未关联额度账户。", 409, "team_mapping_missing");
    }

    const page = positiveInt(url.searchParams.get("page"), 1, 10_000);
    const pageSize = positiveInt(url.searchParams.get("pageSize"), 20, 100);
    const type = LOG_TYPE_QUERY[url.searchParams.get("type") ?? ""] ?? undefined;
    const model = url.searchParams.get("model")?.trim() || undefined;
    const tokenName = url.searchParams.get("tokenName")?.trim() || undefined;
    const requestId = url.searchParams.get("requestId")?.trim() || undefined;

    const logs = await getUserLogs(decryptSecret(mapping.newApiPatCiphertext), {
      page,
      pageSize,
      type,
      modelName: model,
      tokenName,
      requestId,
    });
    return consoleJson({
      organizationId,
      page: logs.page,
      pageSize: logs.pageSize,
      total: logs.total,
      items: logs.items.map(mapUsageLog),
    });
  } catch (error) {
    return consoleError(error);
  }
}
