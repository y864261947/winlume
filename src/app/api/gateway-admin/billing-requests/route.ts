import { NextRequest } from "next/server";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import {
  requireGatewayAdminContext,
  gatewayAdminJson,
  gatewayAdminErrorResponse,
  GatewayAdminError,
} from "@/lib/gateway-admin/server";
import { enterpriseBillingRequests, getPlatformDb, organizations } from "@/lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const STATUSES = ["pending", "approved", "rejected"] as const;
type EnterpriseBillingRequestStatus = (typeof STATUSES)[number];

function parseStatus(value: string | null): EnterpriseBillingRequestStatus | undefined {
  if (!value) return undefined;
  if (!STATUSES.includes(value as EnterpriseBillingRequestStatus)) {
    throw new GatewayAdminError("无效的 status 参数。", 400, "invalid_status");
  }
  return value as EnterpriseBillingRequestStatus;
}

export async function GET(request: NextRequest) {
  try {
    await requireGatewayAdminContext();

    const database = getPlatformDb();
    if (!database) {
      return gatewayAdminJson({ error: "数据库未配置。", code: "database_not_configured" }, { status: 503 });
    }

    const params = request.nextUrl.searchParams;
    const status = parseStatus(params.get("status"));
    const search = params.get("search")?.trim() || undefined;

    const limitParam = Number(params.get("limit"));
    const offsetParam = Number(params.get("offset"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.trunc(limitParam), MAX_LIMIT) : DEFAULT_LIMIT;
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? Math.trunc(offsetParam) : 0;

    const conditions = [];
    if (status) conditions.push(eq(enterpriseBillingRequests.status, status));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(enterpriseBillingRequests.companyName, pattern),
          ilike(enterpriseBillingRequests.contactName, pattern),
          ilike(enterpriseBillingRequests.contactEmail, pattern),
          ilike(organizations.name, pattern),
        )!,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      database
        .select({
          id: enterpriseBillingRequests.id,
          organizationId: enterpriseBillingRequests.organizationId,
          organizationName: organizations.name,
          companyName: enterpriseBillingRequests.companyName,
          taxId: enterpriseBillingRequests.taxId,
          contactName: enterpriseBillingRequests.contactName,
          contactEmail: enterpriseBillingRequests.contactEmail,
          contactPhone: enterpriseBillingRequests.contactPhone,
          estimatedMonthlySpendCredits: enterpriseBillingRequests.estimatedMonthlySpendCredits,
          notes: enterpriseBillingRequests.notes,
          status: enterpriseBillingRequests.status,
          reviewNotes: enterpriseBillingRequests.reviewNotes,
          reviewedByUserId: enterpriseBillingRequests.reviewedByUserId,
          createdAt: enterpriseBillingRequests.createdAt,
          updatedAt: enterpriseBillingRequests.updatedAt,
        })
        .from(enterpriseBillingRequests)
        .innerJoin(organizations, eq(enterpriseBillingRequests.organizationId, organizations.id))
        .where(where)
        .orderBy(desc(enterpriseBillingRequests.createdAt))
        .limit(limit)
        .offset(offset),
      database
        .select({ value: count() })
        .from(enterpriseBillingRequests)
        .innerJoin(organizations, eq(enterpriseBillingRequests.organizationId, organizations.id))
        .where(where),
    ]);

    return gatewayAdminJson({
      requests: rows.map((row) => ({
        ...row,
        estimatedMonthlySpendCredits:
          row.estimatedMonthlySpendCredits === null ? null : Number(row.estimatedMonthlySpendCredits),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      total: totalRows[0]?.value ?? 0,
    });
  } catch (error) {
    return gatewayAdminErrorResponse(error);
  }
}
