import { getCurrentAuthContext } from "@/lib/auth/session";
import { requireGatewayAdminContext, gatewayAdminJson, gatewayAdminErrorResponse, GatewayAdminError } from "@/lib/gateway-admin/server";
import { getPlatformRepositories, type PlatformUserRecord } from "@/lib/platform/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

interface PatchBody {
  status?: unknown;
  platformRole?: unknown;
}

export async function PATCH(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  try {
    await requireGatewayAdminContext();
    const authContext = await getCurrentAuthContext();
    if (!authContext) throw new GatewayAdminError("请先登录。", 401, "authentication_required");

    const { id } = await routeContext.params;
    const body = (await request.json().catch(() => ({}))) as PatchBody;

    const repositories = getPlatformRepositories();
    if (!repositories) {
      return gatewayAdminJson({ error: "数据库未配置。", code: "database_not_configured" }, { status: 503 });
    }

    let statusUpdate: "active" | "suspended" | undefined;
    if (body.status !== undefined) {
      if (body.status !== "active" && body.status !== "suspended") {
        throw new GatewayAdminError(
          "status 只能设置为 active 或 suspended。",
          400,
          "invalid_status",
        );
      }
      statusUpdate = body.status;
    }

    let roleUpdate: "user" | "admin" | undefined;
    if (body.platformRole !== undefined) {
      if (body.platformRole !== "user" && body.platformRole !== "admin") {
        throw new GatewayAdminError(
          "platformRole 只能设置为 user 或 admin。",
          400,
          "invalid_platform_role",
        );
      }
      roleUpdate = body.platformRole;

      if (id === authContext.userId && roleUpdate !== "admin") {
        throw new GatewayAdminError(
          "不能取消自己的管理员权限，请由其他管理员操作。",
          400,
          "self_demote_forbidden",
        );
      }
    }

    if (!statusUpdate && !roleUpdate) {
      throw new GatewayAdminError("没有可更新的字段。", 400, "no_fields_to_update");
    }

    const existing = await repositories.users.findById(id);
    if (!existing || existing.isServiceAccount) {
      throw new GatewayAdminError("用户不存在。", 404, "user_not_found");
    }

    let updated = existing;
    if (statusUpdate) {
      updated = await repositories.users.updateStatus(id, statusUpdate);
    }
    if (roleUpdate) {
      updated = await repositories.users.updatePlatformRole(id, roleUpdate);
    }

    return gatewayAdminJson({ user: toResponseUser(updated) });
  } catch (error) {
    return gatewayAdminErrorResponse(error);
  }
}
