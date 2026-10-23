import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { getCurrentAuthContext } from "@/lib/auth/session";
import { getAuthMode } from "@/lib/platform/auth";
import { getPlatformDb } from "@/lib/platform/db/client";
import { desktopSessions, users } from "@/lib/platform/db/schema";
import { consumeRateLimit } from "@/lib/platform/rate-limit";
import { createDesktopGrant, desktopBearer, desktopCodeHash, desktopRequestId, desktopUserIsValid, desktopWebOrigin, DESKTOP_SESSION_MS, hashDesktopSecret } from "@/lib/platform/desktop-auth";
import { DesktopModelSessionError, resolveDesktopModelSession, revokeDesktopModelSession } from "@/lib/platform/desktop-model-session";

export const runtime = "nodejs";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
type Context = { params: Promise<{ action: string }> };

async function handle(request: Request, context: Context): Promise<Response> {
  const { action } = await context.params;
  const allowed = action === "start" || action === "approve" ? "POST" : action === "request" || action === "model-session" ? "GET" : action === "session" ? "GET,DELETE" : "";
  if (!allowed) return json({ error: "Not found" }, 404);
  if (!allowed.split(",").includes(request.method)) return json({ error: "Method not allowed" }, 405);
  if (getAuthMode() !== "reizo") return json({ error: "桌面登录需要 Reizo 账号服务。" }, 503);
  const db = getPlatformDb();
  if (!db) return json({ error: "账号服务暂不可用。" }, 503);
  const now = new Date();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!consumeRateLimit(`desktop:${action}:${ip}`, action === "start" ? 10 : 120, 60_000)) return json({ error: "操作过于频繁，请稍后重试。" }, 429);

  if (action === "start") {
    const origin = desktopWebOrigin(request);
    // Expired pending requests and sessions are reclaimable, never live grants.
    await db.delete(desktopSessions).where(lt(desktopSessions.expiresAt, now));
    const grant = createDesktopGrant(now);
    await db.insert(desktopSessions).values(grant.row);
    return json({ requestId: grant.row.id, token: grant.token, code: grant.code, expiresAt: grant.row.expiresAt.toISOString(), verificationUrl: `${origin}/desktop/connect?request=${grant.row.id}` }, 201);
  }
  if (action === "request") {
    const id = new URL(request.url).searchParams.get("request");
    if (!desktopRequestId(id)) return json({ error: "登录请求无效。" }, 400);
    const [row] = await db.select({ expiresAt: desktopSessions.expiresAt }).from(desktopSessions).where(and(eq(desktopSessions.id, id), isNull(desktopSessions.userId), gt(desktopSessions.expiresAt, now))).limit(1);
    // Neither the credential nor confirmation code is disclosed to the browser.
    return row ? json({ expiresAt: row.expiresAt.toISOString() }) : json({ error: "此请求已结束或已过期，请从工作台重新发起登录。" }, 410);
  }
  if (action === "approve") {
    if (request.headers.get("origin") !== desktopWebOrigin(request) || !request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Forbidden" }, 403);
    const auth = await getCurrentAuthContext();
    if (!auth) return json({ error: "请先登录网页账号。" }, 401);
    if (!consumeRateLimit(`desktop-approve:${auth.userId}`, 12, 60_000)) return json({ error: "尝试过于频繁，请稍后重试。" }, 429);
    const body = await request.json().catch(() => null);
    const codeHash = desktopCodeHash(body?.code);
    if (!desktopRequestId(body?.requestId) || !codeHash) return json({ error: "请输入工作台显示的完整确认码。" }, 400);
    // Conditional update makes authorization single-use even across server instances.
    const changed = await db.update(desktopSessions).set({ userId: auth.userId, authVersion: auth.authVersion, expiresAt: new Date(now.getTime() + DESKTOP_SESSION_MS) })
      .where(and(eq(desktopSessions.id, body.requestId), eq(desktopSessions.codeHash, codeHash), isNull(desktopSessions.userId), gt(desktopSessions.expiresAt, now)))
      .returning({ id: desktopSessions.id });
    return changed.length ? json({ approved: true }) : json({ error: "确认码不匹配，或登录请求已结束。" }, 409);
  }
  const token = desktopBearer(request);
  if (!token) return json({ error: "登录已失效，请重新登录。" }, 401);
  const tokenHash = hashDesktopSecret(token);
  if (action === "model-session") return json(await resolveDesktopModelSession(db, tokenHash));
  if (request.method === "DELETE") {
    await revokeDesktopModelSession(db, tokenHash);
    await db.delete(desktopSessions).where(eq(desktopSessions.tokenHash, tokenHash));
    return json({ revoked: true });
  }
  const [row] = await db.select().from(desktopSessions).where(eq(desktopSessions.tokenHash, tokenHash)).limit(1);
  if (!row || row.expiresAt <= now) return json({ error: "登录已过期，请重新登录。" }, 401);
  if (!row.userId) return json({ status: "pending", expiresAt: row.expiresAt.toISOString() });
  const [user] = await db.select({ id: users.id, username: users.username, displayName: users.displayName, email: users.email, authVersion: users.authVersion, status: users.status }).from(users).where(eq(users.id, row.userId)).limit(1);
  if (!desktopUserIsValid(row, user ?? null, now)) return json({ error: "账号状态已变化，请重新登录。" }, 401);
  return json({ status: "authenticated", expiresAt: row.expiresAt.toISOString(), user: { id: user.id, username: user.username, displayName: user.displayName, email: user.email } });
}

async function route(request: Request, context: Context) {
  try { return await handle(request, context); }
  catch (error) { return json({ error: error instanceof DesktopModelSessionError ? error.message : "桌面登录服务暂不可用，请稍后重试。" }, error instanceof DesktopModelSessionError ? error.status : 503); }
}
export { route as GET, route as POST, route as DELETE };
