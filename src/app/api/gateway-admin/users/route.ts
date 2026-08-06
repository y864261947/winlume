import { NextRequest } from "next/server";
import { requireGatewayAdminContext, gatewayAdminJson, gatewayAdminErrorResponse } from "@/lib/gateway-admin/server";
import { getPlatformRepositories, type PlatformUserRecord } from "@/lib/platform/repositories";
import type { UserStatus } from "@/lib/platform/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;

/** Sanitized shape returned to the admin UI — never includes passwordHash or
 * other sensitive fields from PlatformUserRecord. */
function toResponseUser(user: PlatformUserRecord) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    platformRole: user.platformRole,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
  };
}

function parseStatus(value: string | null): UserStatus | undefined {
  if (value === "active" || value === "suspended" || value === "pending") return value;
  return undefined;
}

export async function GET(request: NextRequest) {
  try {
    await requireGatewayAdminContext();

    const repositories = getPlatformRepositories();
    if (!repositories) {
      return gatewayAdminJson({ error: "数据库未配置。", code: "database_not_configured" }, { status: 503 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search")?.trim() || undefined;
    const status = parseStatus(searchParams.get("status"));
    const limitParam = Number(searchParams.get("limit"));
    const offsetParam = Number(searchParams.get("offset"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, MAX_LIMIT) : DEFAULT_LIMIT;
    const offset = Number.isFinite(offsetParam) && offsetParam >= 0 ? offsetParam : 0;

    const { users, total } = await repositories.users.list({ search, status, limit, offset });

    return gatewayAdminJson({ users: users.map(toResponseUser), total });
  } catch (error) {
    return gatewayAdminErrorResponse(error);
  }
}
