import { getCurrentAuthContext } from "@/lib/auth/session";

export class GatewayAdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

/** Throws unless the signed-in session has platformRole === "admin". No
 * other WinLume business state (organization role, account status beyond
 * "active") participates in this check — see design doc §4.8. */
export async function requireGatewayAdminContext(): Promise<void> {
  const context = await getCurrentAuthContext();
  if (!context) throw new GatewayAdminError("请先登录。", 401, "authentication_required");
  if (context.platformRole !== "admin") {
    throw new GatewayAdminError("没有访问网关管理后台的权限。", 403, "forbidden");
  }
}

function gatewayAdminToken(): string {
  const token = process.env.WINLUME_GATEWAY_ADMIN_TOKEN?.trim();
  if (!token) throw new GatewayAdminError("网关管理接口尚未配置。", 503, "admin_token_not_configured");
  return token;
}

function gatewayBaseUrl(): string {
  return (process.env.WINLUME_GATEWAY_URL ?? "http://127.0.0.1:4010").replace(/\/+$/, "");
}

/** Proxies one request to the Go gateway's /internal/admin/* API using the
 * server-only shared secret. Never called from client code. */
export async function gatewayAdminFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${gatewayBaseUrl()}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "x-winlume-gateway-admin-token": gatewayAdminToken(),
    },
    cache: "no-store",
  });
}

export function gatewayAdminJson<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, { ...init, headers: { "cache-control": "no-store", ...(init?.headers ?? {}) } });
}

export function gatewayAdminErrorResponse(error: unknown): Response {
  if (error instanceof GatewayAdminError) {
    return gatewayAdminJson({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("Gateway admin request failed", error);
  return gatewayAdminJson({ error: "网关管理请求未完成，请稍后重试。", code: "gateway_admin_request_failed" }, { status: 500 });
}
