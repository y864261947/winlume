import { getPlatformDb } from "@/lib/platform";
import { UsageEventsRepository } from "@/lib/platform/repositories/usage-events";
import type { UsageEventStatus } from "@/lib/platform/types";
import { requireGatewayAdminContext, gatewayAdminJson, gatewayAdminErrorResponse, GatewayAdminError } from "@/lib/gateway-admin/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USAGE_EVENT_STATUSES: UsageEventStatus[] = [
  "reserved",
  "settlement_pending",
  "settled",
  "reversed",
  "failed",
];

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseStatus(value: string | null): UsageEventStatus | undefined {
  if (!value) return undefined;
  if (!USAGE_EVENT_STATUSES.includes(value as UsageEventStatus)) {
    throw new GatewayAdminError("无效的 status 参数。", 400, "invalid_status");
  }
  return value as UsageEventStatus;
}

function parseDate(value: string | null, label: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new GatewayAdminError(`无效的 ${label} 参数。`, 400, "invalid_date");
  }
  return date;
}

export async function GET(request: Request) {
  try {
    await requireGatewayAdminContext();

    const database = getPlatformDb();
    if (!database) throw new GatewayAdminError("平台数据库尚未配置。", 503, "platform_not_configured");

    const url = new URL(request.url);
    const params = url.searchParams;

    const until = parseDate(params.get("until"), "until") ?? new Date();
    const since = parseDate(params.get("since"), "since") ?? new Date(until.getTime() - 24 * 60 * 60 * 1000);
    const status = parseStatus(params.get("status"));
    const model = params.get("model")?.trim() || undefined;
    const search = params.get("search")?.trim() || undefined;

    const limitParam = Number(params.get("limit") ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), MAX_LIMIT) : DEFAULT_LIMIT;

    const offsetParam = Number(params.get("offset") ?? 0);
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? Math.trunc(offsetParam) : 0;

    const repository = new UsageEventsRepository(database);
    const { events, total } = await repository.list({ since, until, status, model, search, limit, offset });

    return gatewayAdminJson({
      events: events.map((event) => ({
        id: event.id,
        occurredAt: event.occurredAt.toISOString(),
        userId: event.userId,
        username: event.username,
        userEmail: event.userEmail,
        organizationId: event.organizationId,
        apiKeyId: event.apiKeyId,
        provider: event.provider,
        model: event.model,
        status: event.status,
        inputTokens: Number(event.inputTokens),
        outputTokens: Number(event.outputTokens),
        totalTokens: Number(event.totalTokens),
        costMicrocredits: Number(event.costMicrocredits),
        requestId: event.requestId,
      })),
      total,
    });
  } catch (error) {
    return gatewayAdminErrorResponse(error);
  }
}
