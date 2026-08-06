import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { getCurrentUserId } from "@/lib/auth/session";
import {
  canManageOrganizationResources,
  enterpriseBillingRequests,
  getPlatformDb,
  getPlatformRepositories,
  usageEvents,
} from "@/lib/platform";
import type { OrganizationRole } from "@/lib/platform";
import type { ApiKeyRecord } from "@/lib/platform/repositories";
import type {
  ConsoleApiKey,
  ConsoleLedgerEntry,
  ConsoleOverview,
  ConsolePaymentOrder,
  ConsoleUsageByKey,
  ConsoleUsagePoint,
  ConsoleWalletDetails,
} from "./types";

export const MICROCREDITS_PER_CREDIT = BigInt(1_000_000);

export class ConsoleRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

export type ConsoleRequestContext = {
  userId: string;
  repositories: NonNullable<ReturnType<typeof getPlatformRepositories>>;
};

export function microcreditsToCredits(value: bigint): number {
  return Number(value) / Number(MICROCREDITS_PER_CREDIT);
}

export function creditsToMicrocredits(value: number): bigint {
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) {
    throw new ConsoleRequestError("额度上限必须是有效的非负数字。", 400, "invalid_quota_limit");
  }
  return BigInt(Math.round(value * Number(MICROCREDITS_PER_CREDIT)));
}

export function consoleJson<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, {
    ...init,
    headers: { "cache-control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function consoleError(error: unknown): Response {
  if (error instanceof ConsoleRequestError) {
    return consoleJson({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("Console request failed", error);
  return consoleJson({ error: "控制台请求未完成，请稍后重试。", code: "console_request_failed" }, { status: 500 });
}

/** Ensure the Auth.js identity has a local WinLume platform record. */
export async function requireConsoleContext(): Promise<ConsoleRequestContext> {
  const userId = await getCurrentUserId();
  if (!userId) throw new ConsoleRequestError("请先登录。", 401, "authentication_required");

  const repositories = getPlatformRepositories();
  if (!repositories) {
    throw new ConsoleRequestError("平台数据库尚未配置。", 503, "platform_not_configured");
  }

  const user = await repositories.users.findById(userId);
  if (!user || user.status !== "active") {
    throw new ConsoleRequestError("当前账户尚未迁移或不可用。", 403, "platform_account_unavailable");
  }
  return { userId, repositories };
}

export function mapConsoleApiKey(
  record: ApiKeyRecord,
  usedQuotaMicrocredits = BigInt(0),
  ownerName: string | null = null,
): ConsoleApiKey {
  const expired = Boolean(record.expiresAt && record.expiresAt.getTime() <= Date.now());
  return {
    id: record.id,
    name: record.name,
    prefix: record.keyPrefix,
    status: expired ? "expired" : record.status,
    createdAt: record.createdAt.toISOString(),
    lastUsedAt: record.lastUsedAt?.toISOString() ?? null,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    quotaLimit: record.quotaLimitMicrocredits === null ? null : microcreditsToCredits(record.quotaLimitMicrocredits),
    usedQuota: microcreditsToCredits(usedQuotaMicrocredits),
    modelScopes: record.allowedModels,
    ipAllowList: record.ipAllowlist,
    organizationId: record.organizationId,
    ownerUserId: record.userId,
    ownerName,
  };
}

/** Sums settled usage cost per API key, regardless of which user owns the key. */
async function usedQuotaForApiKeys(apiKeyIds: string[]): Promise<Map<string, bigint>> {
  if (apiKeyIds.length === 0) return new Map();
  const database = getPlatformDb();
  if (!database) return new Map();
  const rows = await database
    .select({ apiKeyId: usageEvents.apiKeyId, cost: usageEvents.costMicrocredits })
    .from(usageEvents)
    .where(and(inArray(usageEvents.apiKeyId, apiKeyIds), eq(usageEvents.status, "settled")));
  const result = new Map<string, bigint>();
  for (const row of rows) {
    if (!row.apiKeyId) continue;
    result.set(row.apiKeyId, (result.get(row.apiKeyId) ?? BigInt(0)) + row.cost);
  }
  return result;
}

/**
 * Lists keys for the caller's personal workspace (organizationId omitted) or
 * for a whole organization workspace (organizationId provided). Callers must
 * verify the caller's membership/permissions in that organization before
 * passing organizationId — this function does not re-check access.
 */
export async function listConsoleApiKeys(
  context: ConsoleRequestContext,
  organizationId?: string | null,
): Promise<ConsoleApiKey[]> {
  const records = organizationId
    ? await context.repositories.apiKeys.listForOrganization(organizationId)
    : await context.repositories.apiKeys.listForUser(context.userId);
  const usedByKey = await usedQuotaForApiKeys(records.map((record) => record.id));
  let ownerNames: Map<string, string> | null = null;
  if (organizationId) {
    const uniqueOwnerIds = [...new Set(records.map((record) => record.userId))];
    const owners = await Promise.all(uniqueOwnerIds.map((id) => context.repositories.users.findById(id)));
    ownerNames = new Map(
      owners
        .filter((owner): owner is NonNullable<typeof owner> => Boolean(owner))
        .map((owner) => [owner.id, owner.displayName]),
    );
  }
  return records
    .map((record) => mapConsoleApiKey(record, usedByKey.get(record.id) ?? BigInt(0), ownerNames?.get(record.userId) ?? null))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/**
 * Breaks down usage (requests, settled/reserved credits) by API key over the
 * trailing `sinceDays` days.
 *
 * Personal view (organizationId omitted): scopes to usageEvents.userId ===
 * context.userId, same rows getConsoleOverview already sums, just grouped by
 * apiKeyId instead of by day.
 *
 * Organization view (organizationId provided): scopes to
 * usageEvents.organizationId. That column is populated by the Go gateway at
 * write time from the resolved caller identity's organization (see
 * services/gateway/internal/billing/service.go, which sets
 * `OrganizationID: operation.Identity.OrganizationID` on the insert in
 * services/gateway/internal/storage/billing.go) — not derived after the
 * fact from the key's current organizationId — so it reliably reflects every
 * member's usage under the org's keys, not just the caller's own keys, and we
 * scope directly on usageEvents.organizationId rather than joining through
 * apiKeys.organizationId.
 *
 * Callers must verify the caller's membership/permissions in that
 * organization before passing organizationId — this function does not
 * re-check access (mirrors listConsoleApiKeys above).
 */
export async function getConsoleUsageByKey(
  context: ConsoleRequestContext,
  organizationId?: string | null,
  sinceDays = 14,
): Promise<ConsoleUsageByKey[]> {
  const database = getPlatformDb();
  if (!database) throw new ConsoleRequestError("平台数据库尚未配置。", 503, "platform_not_configured");

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (sinceDays - 1));
  since.setUTCHours(0, 0, 0, 0);

  const scopeCondition = organizationId
    ? eq(usageEvents.organizationId, organizationId)
    : eq(usageEvents.userId, context.userId);

  const rows = await database
    .select({
      apiKeyId: usageEvents.apiKeyId,
      requests: sql<string>`count(*) filter (where ${usageEvents.status} = 'settled')`,
      settled: sql<string>`coalesce(sum(case when ${usageEvents.status} = 'settled' then ${usageEvents.costMicrocredits} else 0 end), 0)`,
      reserved: sql<string>`coalesce(sum(case when ${usageEvents.status} = 'reserved' then ${usageEvents.costMicrocredits} else 0 end), 0)`,
    })
    .from(usageEvents)
    .where(and(scopeCondition, gte(usageEvents.occurredAt, since), isNotNull(usageEvents.apiKeyId)))
    .groupBy(usageEvents.apiKeyId);

  const apiKeyIds = rows.map((row) => row.apiKeyId).filter((id): id is string => Boolean(id));
  if (apiKeyIds.length === 0) return [];

  // Reuse the same key listing the keys feature uses per workspace, so key
  // name/prefix labels stay consistent with what ConsoleKeysContent shows.
  const keyRecords = organizationId
    ? await context.repositories.apiKeys.listForOrganization(organizationId)
    : await context.repositories.apiKeys.listForUser(context.userId);
  const keysById = new Map(keyRecords.map((record) => [record.id, record]));

  let ownerNames: Map<string, string> | null = null;
  if (organizationId) {
    const uniqueOwnerIds = [...new Set(keyRecords.map((record) => record.userId))];
    const owners = await Promise.all(uniqueOwnerIds.map((id) => context.repositories.users.findById(id)));
    ownerNames = new Map(
      owners
        .filter((owner): owner is NonNullable<typeof owner> => Boolean(owner))
        .map((owner) => [owner.id, owner.displayName]),
    );
  }

  return rows
    .filter((row): row is typeof row & { apiKeyId: string } => Boolean(row.apiKeyId))
    .map((row) => {
      const record = keysById.get(row.apiKeyId);
      return {
        apiKeyId: row.apiKeyId,
        keyName: record?.name ?? "未知 Key",
        keyPrefix: record?.keyPrefix ?? "--",
        ownerName: organizationId && record ? ownerNames?.get(record.userId) ?? null : null,
        requests: Number(row.requests),
        settledCredits: microcreditsToCredits(BigInt(row.settled)),
        reservedCredits: microcreditsToCredits(BigInt(row.reserved)),
      };
    })
    .sort((left, right) => right.settledCredits - left.settledCredits);
}

/** Same permission tier team.ts uses for member management (owner/admin), scoped to API keys. */
export function ensureOrganizationKeyManager(role: OrganizationRole): void {
  if (!canManageOrganizationResources(role)) {
    throw new ConsoleRequestError("只有工作区 owner 或 admin 可以管理工作区 API Key。", 403, "organization_key_forbidden");
  }
}

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function lastUsageDays(days: number): ConsoleUsagePoint[] {
  const points: ConsoleUsagePoint[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - offset);
    points.push({ date: dayKey(day), credits: 0, requests: 0 });
  }
  return points;
}

async function subscriptionSummary(context: ConsoleRequestContext): Promise<ConsoleOverview["wallet"]["subscription"]> {
  const subscription = await context.repositories.billing.findActiveSubscription(context.userId);
  if (!subscription) return { name: "按量计费", status: "none", renewsAt: null };
  const plan = await context.repositories.billing.findPlanById(subscription.planId);
  return {
    name: plan?.name ?? "已订阅方案",
    status: subscription.status === "active" || subscription.status === "trialing" ? "active" : "inactive",
    renewsAt: subscription.currentPeriodEnd?.toISOString() ?? null,
  };
}

function mapLedgerEntry(entry: Awaited<ReturnType<ConsoleRequestContext["repositories"]["wallets"]["listLedgerEntries"]>>[number]): ConsoleLedgerEntry {
  return {
    id: entry.id,
    type: entry.entryType,
    amountCredits: microcreditsToCredits(entry.amountMicrocredits),
    reference: entry.reference,
    createdAt: entry.createdAt.toISOString(),
  };
}

function mapPaymentOrder(
  order: Awaited<ReturnType<ConsoleRequestContext["repositories"]["billing"]["listPaymentOrders"]>>[number],
  providerName: string,
): ConsolePaymentOrder {
  return {
    id: order.id,
    reference: order.orderReference,
    status: order.status,
    amount: Number(order.amountMinor) / 100,
    currency: order.currency,
    credits: microcreditsToCredits(order.creditsMicrocredits),
    provider: providerName,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
  };
}

export async function getConsoleWalletDetails(context: ConsoleRequestContext): Promise<ConsoleWalletDetails> {
  const wallet = await context.repositories.wallets.ensureForUser(context.userId);
  const database = getPlatformDb();
  if (!database) throw new ConsoleRequestError("平台数据库尚未配置。", 503, "platform_not_configured");
  const [balance, ledger, orders, providers, subscription, usageTotals] = await Promise.all([
    context.repositories.wallets.getBalance(wallet.id),
    context.repositories.wallets.listLedgerEntries(wallet.id, 50),
    context.repositories.billing.listPaymentOrders(context.userId, 50),
    context.repositories.billing.listPaymentProviders("active"),
    subscriptionSummary(context),
    database.select({
      settled: sql<string>`coalesce(sum(case when ${usageEvents.status} = 'settled' then ${usageEvents.costMicrocredits} else 0 end), 0)`,
      reserved: sql<string>`coalesce(sum(case when ${usageEvents.status} = 'reserved' then ${usageEvents.costMicrocredits} else 0 end), 0)`,
    }).from(usageEvents).where(eq(usageEvents.userId, context.userId)),
  ]);
  const providerNames = new Map(providers.map((provider) => [provider.id, provider.name]));
  return {
    wallet: {
      availableCredits: microcreditsToCredits(balance),
      reservedCredits: microcreditsToCredits(BigInt(usageTotals[0]?.reserved ?? "0")),
      usedCredits: microcreditsToCredits(BigInt(usageTotals[0]?.settled ?? "0")),
      currency: wallet.currency,
      subscription,
    },
    ledger: ledger.map(mapLedgerEntry),
    paymentOrders: orders.map((order) => mapPaymentOrder(order, providerNames.get(order.paymentProviderId) ?? "支付渠道")),
  };
}

export async function getConsoleOverview(context: ConsoleRequestContext): Promise<ConsoleOverview> {
  const database = getPlatformDb();
  if (!database) throw new ConsoleRequestError("平台数据库尚未配置。", 503, "platform_not_configured");
  const wallet = await context.repositories.wallets.ensureForUser(context.userId);
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 13);
  since.setUTCHours(0, 0, 0, 0);

  const [balance, memberships, keys, usageRows, usageTotals, subscription] = await Promise.all([
    context.repositories.wallets.getBalance(wallet.id),
    context.repositories.organizations.listMembershipsForUser(context.userId),
    context.repositories.apiKeys.listForUser(context.userId),
    database
      .select({ occurredAt: usageEvents.occurredAt, cost: usageEvents.costMicrocredits, status: usageEvents.status })
      .from(usageEvents)
      .where(and(eq(usageEvents.userId, context.userId), gte(usageEvents.occurredAt, since))),
    database
      .select({
        settled: sql<string>`coalesce(sum(case when ${usageEvents.status} = 'settled' then ${usageEvents.costMicrocredits} else 0 end), 0)`,
        reserved: sql<string>`coalesce(sum(case when ${usageEvents.status} = 'reserved' then ${usageEvents.costMicrocredits} else 0 end), 0)`,
      })
      .from(usageEvents)
      .where(eq(usageEvents.userId, context.userId)),
    subscriptionSummary(context),
  ]);

  const organizationMembership = memberships[0] ?? null;
  const organization = organizationMembership
    ? await context.repositories.organizations.findById(organizationMembership.organizationId)
    : null;
  const usage = lastUsageDays(14);
  const byDay = new Map(usage.map((point) => [point.date, point]));
  for (const row of usageRows) {
    if (row.status !== "settled") continue;
    const point = byDay.get(dayKey(row.occurredAt));
    if (!point) continue;
    point.requests += 1;
    point.credits += microcreditsToCredits(row.cost);
  }
  const totals = usageTotals[0];
  return {
    wallet: {
      availableCredits: microcreditsToCredits(balance),
      reservedCredits: microcreditsToCredits(BigInt(totals?.reserved ?? "0")),
      usedCredits: microcreditsToCredits(BigInt(totals?.settled ?? "0")),
      currency: wallet.currency,
      subscription,
    },
    apiKeyCount: keys.filter((key) => key.status === "active" && (!key.expiresAt || key.expiresAt.getTime() > Date.now())).length,
    activeOrganization: organization && organizationMembership
      ? { id: organization.id, name: organization.name, role: organizationMembership.role }
      : null,
    usage,
    platformReady: true,
  };
}

export function parseConsoleKeyInput(value: unknown): {
  name: string;
  organizationId: string | null;
  expiresAt: Date | null;
  quotaLimitMicrocredits: bigint | null;
  allowedModels: string[];
  ipAllowlist: string[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConsoleRequestError("请求内容无效。", 400, "invalid_request");
  }
  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 120) {
    throw new ConsoleRequestError("密钥名称必须为 1 到 120 个字符。", 400, "invalid_key_name");
  }
  let organizationId: string | null = null;
  if (input.organizationId !== undefined && input.organizationId !== null && input.organizationId !== "") {
    if (typeof input.organizationId !== "string") {
      throw new ConsoleRequestError("工作区标识无效。", 400, "invalid_organization_id");
    }
    organizationId = input.organizationId;
  }
  let expiresAt: Date | null = null;
  if (input.expiresAt !== undefined && input.expiresAt !== null && input.expiresAt !== "") {
    if (typeof input.expiresAt !== "string") throw new ConsoleRequestError("过期时间无效。", 400, "invalid_expiry");
    expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      throw new ConsoleRequestError("过期时间必须晚于当前时间。", 400, "invalid_expiry");
    }
  }
  const asStringList = (raw: unknown, code: string): string[] => {
    if (raw === undefined || raw === null) return [];
    if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== "string")) {
      throw new ConsoleRequestError("列表字段格式无效。", 400, code);
    }
    return [...new Set(raw.map((entry) => entry.trim()).filter(Boolean))].slice(0, 100);
  };
  const quotaLimitMicrocredits = input.quotaLimit === undefined || input.quotaLimit === null || input.quotaLimit === ""
    ? null
    : creditsToMicrocredits(typeof input.quotaLimit === "number" ? input.quotaLimit : Number.NaN);
  return {
    name,
    organizationId,
    expiresAt,
    quotaLimitMicrocredits,
    allowedModels: asStringList(input.modelScopes, "invalid_model_scopes"),
    ipAllowlist: asStringList(input.ipAllowList, "invalid_ip_allowlist"),
  };
}

export type ConsoleEnterpriseBillingRequest = {
  id: string;
  organizationId: string;
  companyName: string;
  taxId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  estimatedMonthlySpendCredits: number | null;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNotes: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapEnterpriseBillingRequest(
  record: typeof enterpriseBillingRequests.$inferSelect,
): ConsoleEnterpriseBillingRequest {
  return {
    id: record.id,
    organizationId: record.organizationId,
    companyName: record.companyName,
    taxId: record.taxId,
    contactName: record.contactName,
    contactEmail: record.contactEmail,
    contactPhone: record.contactPhone,
    estimatedMonthlySpendCredits:
      record.estimatedMonthlySpendCredits === null ? null : Number(record.estimatedMonthlySpendCredits),
    notes: record.notes,
    status: record.status,
    reviewNotes: record.reviewNotes,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Same permission tier as ensureOrganizationKeyManager (owner/admin), scoped to enterprise billing requests. */
export function ensureOrganizationBillingManager(role: OrganizationRole): void {
  if (!canManageOrganizationResources(role)) {
    throw new ConsoleRequestError("只有工作区 owner 或 admin 可以提交对公结算申请。", 403, "organization_billing_forbidden");
  }
}

export function parseEnterpriseBillingRequestInput(value: unknown): {
  companyName: string;
  taxId: string | null;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  estimatedMonthlySpendCredits: number | null;
  notes: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConsoleRequestError("请求内容无效。", 400, "invalid_request");
  }
  const input = value as Record<string, unknown>;
  const companyName = typeof input.companyName === "string" ? input.companyName.trim() : "";
  if (!companyName || companyName.length > 200) {
    throw new ConsoleRequestError("公司名称必须为 1 到 200 个字符。", 400, "invalid_company_name");
  }
  const contactName = typeof input.contactName === "string" ? input.contactName.trim() : "";
  if (!contactName || contactName.length > 120) {
    throw new ConsoleRequestError("联系人姓名必须为 1 到 120 个字符。", 400, "invalid_contact_name");
  }
  const contactEmail = typeof input.contactEmail === "string" ? input.contactEmail.trim() : "";
  if (!contactEmail || contactEmail.length > 320 || !contactEmail.includes("@")) {
    throw new ConsoleRequestError("请输入有效的联系邮箱。", 400, "invalid_contact_email");
  }
  const optionalString = (raw: unknown, maxLength: number, code: string): string | null => {
    if (raw === undefined || raw === null || raw === "") return null;
    if (typeof raw !== "string" || raw.length > maxLength) {
      throw new ConsoleRequestError("字段格式无效。", 400, code);
    }
    return raw.trim() || null;
  };
  let estimatedMonthlySpendCredits: number | null = null;
  if (
    input.estimatedMonthlySpendCredits !== undefined &&
    input.estimatedMonthlySpendCredits !== null &&
    input.estimatedMonthlySpendCredits !== ""
  ) {
    const parsed =
      typeof input.estimatedMonthlySpendCredits === "number"
        ? input.estimatedMonthlySpendCredits
        : Number(input.estimatedMonthlySpendCredits);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new ConsoleRequestError("预估月消耗必须是有效的非负数字。", 400, "invalid_estimated_spend");
    }
    estimatedMonthlySpendCredits = parsed;
  }
  return {
    companyName,
    taxId: optionalString(input.taxId, 64, "invalid_tax_id"),
    contactName,
    contactEmail,
    contactPhone: optionalString(input.contactPhone, 40, "invalid_contact_phone"),
    estimatedMonthlySpendCredits,
    notes: optionalString(input.notes, 4000, "invalid_notes"),
  };
}

/**
 * v1 enterprise billing is a lead-capture + manual review flow (see the
 * schema.ts comment on enterpriseBillingRequests) — submitting a request does
 * not create an invoice or touch the wallet; it only records the request for
 * gateway-admin review. Enforces one open (pending) request per organization
 * at a time: if the org already has a pending request, this throws rather
 * than silently upserting — callers should show the existing pending request
 * instead of calling this again (see getEnterpriseBillingRequestForOrg). A
 * partial unique index on the table backs this up at the data layer in case
 * of a race between concurrent submissions.
 */
export async function submitEnterpriseBillingRequest(
  context: ConsoleRequestContext,
  organizationId: string,
  value: unknown,
): Promise<ConsoleEnterpriseBillingRequest> {
  const membership = await context.repositories.organizations.getMembership(organizationId, context.userId);
  if (!membership) throw new ConsoleRequestError("你无权访问该工作区。", 403, "organization_forbidden");
  ensureOrganizationBillingManager(membership.role);

  const database = getPlatformDb();
  if (!database) throw new ConsoleRequestError("平台数据库尚未配置。", 503, "platform_not_configured");

  const existingPending = await database
    .select({ id: enterpriseBillingRequests.id })
    .from(enterpriseBillingRequests)
    .where(
      and(eq(enterpriseBillingRequests.organizationId, organizationId), eq(enterpriseBillingRequests.status, "pending")),
    )
    .limit(1);
  if (existingPending.length > 0) {
    throw new ConsoleRequestError(
      "该工作区已有一个待审核的对公结算申请，请等待审核结果。",
      409,
      "enterprise_billing_request_pending",
    );
  }

  const input = parseEnterpriseBillingRequestInput(value);
  const [record] = await database
    .insert(enterpriseBillingRequests)
    .values({
      organizationId,
      submittedByUserId: context.userId,
      companyName: input.companyName,
      taxId: input.taxId,
      contactName: input.contactName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      estimatedMonthlySpendCredits:
        input.estimatedMonthlySpendCredits === null ? null : String(input.estimatedMonthlySpendCredits),
      notes: input.notes,
    })
    .returning();
  if (!record) throw new ConsoleRequestError("提交对公结算申请失败，请稍后重试。", 500, "enterprise_billing_request_failed");
  return mapEnterpriseBillingRequest(record);
}

/**
 * Returns the most recent enterprise billing request for the org (if any),
 * for display on /account/enterprise. Any member of the org may view the
 * status; only owner/admin may submit (see submitEnterpriseBillingRequest).
 */
export async function getEnterpriseBillingRequestForOrg(
  context: ConsoleRequestContext,
  organizationId: string,
): Promise<ConsoleEnterpriseBillingRequest | null> {
  const membership = await context.repositories.organizations.getMembership(organizationId, context.userId);
  if (!membership) throw new ConsoleRequestError("你无权访问该工作区。", 403, "organization_forbidden");

  const database = getPlatformDb();
  if (!database) throw new ConsoleRequestError("平台数据库尚未配置。", 503, "platform_not_configured");

  const [record] = await database
    .select()
    .from(enterpriseBillingRequests)
    .where(eq(enterpriseBillingRequests.organizationId, organizationId))
    .orderBy(desc(enterpriseBillingRequests.createdAt))
    .limit(1);
  return record ? mapEnterpriseBillingRequest(record) : null;
}
