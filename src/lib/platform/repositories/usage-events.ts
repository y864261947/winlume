import { and, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { PlatformDatabase } from "../db/client";
import { usageEvents, users } from "../db/schema";
import type { UsageEventStatus } from "../types";

export type UsageEventRecord = InferSelectModel<typeof usageEvents>;

export interface UsageEventListItem {
  id: string;
  occurredAt: Date;
  userId: string;
  username: string | null;
  userEmail: string | null;
  organizationId: string | null;
  apiKeyId: string | null;
  provider: string;
  model: string;
  status: UsageEventStatus;
  inputTokens: bigint;
  outputTokens: bigint;
  totalTokens: bigint;
  costMicrocredits: bigint;
  requestId: string | null;
}

/**
 * Read-only access to `usage_events` for the gateway-admin ops view — the
 * whole-platform request log, distinct from the per-user queries in
 * src/lib/console/server.ts (getConsoleUsageByKey/getConsoleOverview), which
 * scope to a single caller's userId/organizationId. This repository never
 * scopes by caller; the API route above it is responsible for the admin
 * auth check (requireGatewayAdminContext).
 */
export class UsageEventsRepository {
  constructor(private readonly database: PlatformDatabase) {}

  /** Lists usage events across the whole platform, newest first, joined with
   * `users` for display. `search` matches username/email via ILIKE. Always
   * paginated — callers must pass a capped `limit`. */
  async list(params: {
    since?: Date;
    until?: Date;
    status?: UsageEventStatus;
    model?: string;
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ events: UsageEventListItem[]; total: number }> {
    const conditions = [];

    if (params.since) conditions.push(gte(usageEvents.occurredAt, params.since));
    if (params.until) conditions.push(lte(usageEvents.occurredAt, params.until));
    if (params.status) conditions.push(eq(usageEvents.status, params.status));

    const model = params.model?.trim();
    if (model) conditions.push(ilike(usageEvents.model, `%${model}%`));

    const search = params.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(ilike(users.username, pattern), ilike(users.email, pattern))!);
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, [{ value: total }]] = await Promise.all([
      this.database
        .select({
          id: usageEvents.id,
          occurredAt: usageEvents.occurredAt,
          userId: usageEvents.userId,
          username: users.username,
          userEmail: users.email,
          organizationId: usageEvents.organizationId,
          apiKeyId: usageEvents.apiKeyId,
          provider: usageEvents.provider,
          model: usageEvents.model,
          status: usageEvents.status,
          inputTokens: usageEvents.inputTokens,
          outputTokens: usageEvents.outputTokens,
          totalTokens: usageEvents.totalTokens,
          costMicrocredits: usageEvents.costMicrocredits,
          requestId: usageEvents.requestId,
        })
        .from(usageEvents)
        .leftJoin(users, eq(usageEvents.userId, users.id))
        .where(where)
        .orderBy(desc(usageEvents.occurredAt))
        .limit(params.limit)
        .offset(params.offset),
      this.database
        .select({ value: count() })
        .from(usageEvents)
        .leftJoin(users, eq(usageEvents.userId, users.id))
        .where(where),
    ]);

    return { events: rows, total };
  }
}
