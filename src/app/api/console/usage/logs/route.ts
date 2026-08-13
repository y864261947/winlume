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
    const pat = decryptSecret(mapping.newApiPatCiphertext);

    if (type) {
      const logs = await getUserLogs(pat, { page, pageSize, type, modelName: model, tokenName, requestId });
      return consoleJson({
        organizationId,
        page: logs.page,
        pageSize: logs.pageSize,
        total: logs.total,
        items: logs.items.map(mapUsageLog),
      });
    }

    // No status filter ("全部状态"): new-api's log table also carries
    // non-request events (top-up, admin quota adjustments, system, login)
    // under the same list, and its type filter only accepts one value at a
    // time. A per-request log should never show those, so fetch the two
    // request-shaped types (consume + error) separately and merge them
    // instead of asking upstream for type=0 ("all").
    const [consumeLogs, errorLogs] = await Promise.all([
      getUserLogs(pat, { page, pageSize, type: LOG_TYPE_QUERY.consume, modelName: model, tokenName, requestId }),
      getUserLogs(pat, { page, pageSize, type: LOG_TYPE_QUERY.error, modelName: model, tokenName, requestId }),
    ]);
    const merged = [...consumeLogs.items, ...errorLogs.items]
      .sort((left, right) => (right.created_at ?? 0) - (left.created_at ?? 0))
      .slice(0, pageSize);
    return consoleJson({
      organizationId,
      page,
      pageSize,
      total: consumeLogs.total + errorLogs.total,
      items: merged.map(mapUsageLog),
    });
  } catch (error) {
    return consoleError(error);
  }
}
