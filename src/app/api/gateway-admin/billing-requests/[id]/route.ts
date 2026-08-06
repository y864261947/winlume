import { eq } from "drizzle-orm";
import { getCurrentAuthContext } from "@/lib/auth/session";
import {
  requireGatewayAdminContext,
  gatewayAdminJson,
  gatewayAdminErrorResponse,
  GatewayAdminError,
} from "@/lib/gateway-admin/server";
import { enterpriseBillingRequests, getPlatformDb } from "@/lib/platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  status?: unknown;
  reviewNotes?: unknown;
}

function toResponseRequest(record: typeof enterpriseBillingRequests.$inferSelect) {
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
    reviewedByUserId: record.reviewedByUserId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function PATCH(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  try {
    await requireGatewayAdminContext();
    const authContext = await getCurrentAuthContext();
    if (!authContext) throw new GatewayAdminError("请先登录。", 401, "authentication_required");

    const { id } = await routeContext.params;
    const body = (await request.json().catch(() => ({}))) as PatchBody;

    if (body.status !== "approved" && body.status !== "rejected") {
      throw new GatewayAdminError("status 只能设置为 approved 或 rejected。", 400, "invalid_status");
    }
    let reviewNotes: string | null = null;
    if (body.reviewNotes !== undefined && body.reviewNotes !== null) {
      if (typeof body.reviewNotes !== "string") {
        throw new GatewayAdminError("reviewNotes 格式无效。", 400, "invalid_review_notes");
      }
      reviewNotes = body.reviewNotes.trim().slice(0, 4000) || null;
    }

    const database = getPlatformDb();
    if (!database) {
      return gatewayAdminJson({ error: "数据库未配置。", code: "database_not_configured" }, { status: 503 });
    }

    const [existing] = await database
      .select()
      .from(enterpriseBillingRequests)
      .where(eq(enterpriseBillingRequests.id, id))
      .limit(1);
    if (!existing) throw new GatewayAdminError("申请不存在。", 404, "enterprise_billing_request_not_found");
    if (existing.status !== "pending") {
      throw new GatewayAdminError(
        "该申请已完成审核，不能重复操作。",
        409,
        "enterprise_billing_request_already_reviewed",
      );
    }

    const [updated] = await database
      .update(enterpriseBillingRequests)
      .set({
        status: body.status,
        reviewNotes,
        reviewedByUserId: authContext.userId,
        updatedAt: new Date(),
      })
      .where(eq(enterpriseBillingRequests.id, id))
      .returning();
    if (!updated) {
      throw new GatewayAdminError("更新失败，请稍后重试。", 500, "enterprise_billing_request_update_failed");
    }

    return gatewayAdminJson({ request: toResponseRequest(updated) });
  } catch (error) {
    return gatewayAdminErrorResponse(error);
  }
}
