import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { getCurrentAuthContext } from "@/lib/auth/session";
import { getAuthMode, hashPassword, passwordWouldBeTruncatedByBcrypt } from "@/lib/platform/auth";
import {
  getPlatformDb,
  getPlatformRepositories,
  usageEvents,
} from "@/lib/platform";
import { provisionPlatformUser } from "@/lib/platform/provision";

function legacyGatewayUrl(): string | undefined {
  const configured = process.env.NEW_API_URL?.trim();
  return configured ? configured.replace(/\/+$/, "") : undefined;
}

function jsonBody(response: Response, body: string) {
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}

async function register(request: NextRequest) {
  if (request.method !== "POST") {
    return NextResponse.json({ success: false, message: "Method not allowed" }, { status: 405 });
  }
  if (getAuthMode() !== "legacy") {
    try {
      const body = await request.json() as Record<string, unknown>;
      const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const displayName = typeof body.display_name === "string" ? body.display_name.trim() : username;
      if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
        return NextResponse.json({ success: false, message: "用户名需为 3 至 64 位，仅可使用小写字母、数字、点、下划线或连字符。" }, { status: 400 });
      }
      if (password.length < 8 || password.length > 128 || passwordWouldBeTruncatedByBcrypt(password)) {
        return NextResponse.json({ success: false, message: "密码需为 8 至 72 个 UTF-8 字节。" }, { status: 400 });
      }
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) {
        return NextResponse.json({ success: false, message: "请输入有效的邮箱地址。" }, { status: 400 });
      }
      if (!displayName || displayName.length > 120) {
        return NextResponse.json({ success: false, message: "显示名称需为 1 至 120 个字符。" }, { status: 400 });
      }
      const database = getPlatformDb();
      if (!database) {
        return NextResponse.json({ success: false, message: "平台数据库尚未配置。" }, { status: 503 });
      }
      const passwordHash = await hashPassword(password);
      const user = await provisionPlatformUser(database, {
        username,
        email,
        displayName,
        passwordHash,
      });
      return NextResponse.json({ success: true, data: { id: user.id, username: user.username } }, { status: 201 });
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: string }).code : undefined;
      if (code === "23505") {
        return NextResponse.json({ success: false, message: "用户名或邮箱已被使用。" }, { status: 409 });
      }
      console.error("Reizo account registration failed", error);
      return NextResponse.json({ success: false, message: "注册未完成，请稍后重试。" }, { status: 500 });
    }
  }
  const gatewayUrl = legacyGatewayUrl();
  if (!gatewayUrl) {
    return NextResponse.json({ success: false, message: "旧账户网关未配置。" }, { status: 503 });
  }
  try {
    const upstream = await fetch(`${gatewayUrl}/api/user/register`, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
      body: await request.text(),
      cache: "no-store",
    });
    return jsonBody(upstream, await upstream.text());
  } catch {
    return NextResponse.json({ success: false, message: "账户网关暂时不可访问，请稍后重试。" }, { status: 502 });
  }
}

export async function GET(_request: NextRequest, context: RouteContext<"/api/account/[action]">) {
  const { action } = await context.params;
  if (action !== "self") {
    return NextResponse.json({ success: false, message: "Unknown account action" }, { status: 404 });
  }

  const user = await getCurrentAuthContext();
  if (!user) {
    return NextResponse.json({ success: false, message: "请先登录。" }, { status: 401 });
  }

  if (getAuthMode() === "legacy") {
    return NextResponse.json({
      success: true,
      data: {
        id: user.userId,
        username: user.username,
        display_name: user.displayName,
        email: user.email ?? "",
      },
    }, { headers: { "cache-control": "no-store" } });
  }

  const repositories = getPlatformRepositories();
  const database = getPlatformDb();
  if (!repositories || !database) {
    return NextResponse.json({ success: false, message: "平台数据库尚未配置。" }, { status: 503 });
  }
  const wallet = await repositories.wallets.ensureForUser(user.userId);
  const [balance, totals] = await Promise.all([
    repositories.wallets.getBalance(wallet.id),
    database.select({
      used: sql<string>`coalesce(sum(case when ${usageEvents.status} = 'settled' then ${usageEvents.costMicrocredits} else 0 end), 0)`,
      requestCount: sql<string>`coalesce(sum(case when ${usageEvents.status} = 'settled' then 1 else 0 end), 0)`,
    }).from(usageEvents).where(and(eq(usageEvents.userId, user.userId), eq(usageEvents.status, "settled"))),
  ]);
  const total = totals[0];

  return NextResponse.json({
    success: true,
    data: {
      id: user.userId,
      username: user.username,
      display_name: user.displayName,
      email: user.email ?? "",
      quota: Number(balance),
      used_quota: Number(total?.used ?? "0"),
      request_count: Number(total?.requestCount ?? "0"),
      group: "personal",
    },
  }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest, context: RouteContext<"/api/account/[action]">) {
  const { action } = await context.params;
  if (action === "register") return register(request);
  return NextResponse.json({ success: false, message: "Unknown account action" }, { status: 404 });
}
