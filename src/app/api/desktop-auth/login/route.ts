import { authenticatePlatformCredentials, getAuthMode } from "@/lib/platform/auth";
import { createDesktopGrant, desktopWebOrigin, DESKTOP_SESSION_MS, hashDesktopSecret } from "@/lib/platform/desktop-auth";
import { getPlatformDb } from "@/lib/platform/db/client";
import { desktopSessions } from "@/lib/platform/db/schema";
import { consumeRateLimit } from "@/lib/platform/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

export async function POST(request: Request) {
  try {
    if (getAuthMode() !== "reizo") return json({ error: "账号密码登录需要 Reizo 账号服务。" }, 503);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "请使用 JSON 提交登录信息。" }, 415);
    const origin = request.headers.get("origin");
    if (origin && origin !== desktopWebOrigin(request)) return json({ error: "Forbidden" }, 403);
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!consumeRateLimit(`desktop-password:ip:${ip}`, 10, 60_000)) return json({ error: "尝试过于频繁，请稍后重试。" }, 429);
    const db = getPlatformDb();
    if (!db) return json({ error: "账号服务暂不可用。" }, 503);

    const reader = request.body?.getReader();
    if (!reader) return json({ error: "请输入用户名或邮箱和密码。" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); return json({ error: "登录信息过长。" }, 413); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { return json({ error: "登录信息格式不正确。" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "请输入用户名或邮箱和密码。" }, 400);
    const input = body as Record<string, unknown>;
    if (typeof input.username !== "string" || !input.username.trim() || input.username.trim().length > 320 ||
      typeof input.password !== "string" || !input.password || input.password.length > 128) return json({ error: "请输入有效的用户名或邮箱和密码。" }, 400);
    const username = input.username.trim();
    if (!consumeRateLimit(`desktop-password:account:${hashDesktopSecret(username.toLowerCase())}`, 10, 5 * 60_000)) return json({ error: "尝试过于频繁，请稍后重试。" }, 429);
    const user = await authenticatePlatformCredentials({ username, password: input.password });
    if (!user) return json({ error: "账号或密码不正确。" }, 401);

    const now = new Date();
    const grant = createDesktopGrant(now);
    const expiresAt = new Date(now.getTime() + DESKTOP_SESSION_MS);
    await db.insert(desktopSessions).values({ ...grant.row, userId: user.id, authVersion: user.authVersion, expiresAt });
    return json({ status: "authenticated", token: grant.token, expiresAt: expiresAt.toISOString(),
      user: { id: user.id, username: user.username, displayName: user.displayName, email: user.email } });
  } catch { return json({ error: "账号服务暂不可用，请稍后重试。" }, 503); }
}
