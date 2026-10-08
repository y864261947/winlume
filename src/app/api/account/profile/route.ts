import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthContext } from "@/lib/auth/session";
import { getAuthMode } from "@/lib/platform/auth";
import { getPlatformDb } from "@/lib/platform/db/client";
import { consumeRateLimit } from "@/lib/platform/rate-limit";
import { ProfileService } from "@/lib/platform/profile-service";
import { ProfileError, profileAvatar, profileName } from "@/lib/platform/profile-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit) throw new ProfileError("上传内容过大。", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ProfileError("请求内容为空。");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new ProfileError("上传内容过大。", 413); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

function postgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return postgresCode(error.cause);
}

export async function POST(request: NextRequest) {
  try {
    const origins = new Set([request.nextUrl.origin]);
    const configured = process.env.NEXTAUTH_URL || process.env.AUTH_URL;
    if (configured) origins.add(new URL(configured).origin);
    if (!origins.has(request.headers.get("origin") || "") || request.headers.get("sec-fetch-site") === "cross-site") throw new ProfileError("请求来源无效，请刷新页面后重试。", 403);
    const auth = await getCurrentAuthContext();
    if (!auth) throw new ProfileError("请先登录。", 401);
    if (getAuthMode() === "legacy") throw new ProfileError("当前账户由原账户系统管理。", 409);
    if (!consumeRateLimit(`profile:${auth.userId}`, 20, 60_000)) throw new ProfileError("操作过于频繁，请稍后重试。", 429);
    const database = getPlatformDb();
    if (!database) throw new ProfileError("账户服务暂不可用。", 503);
    const service = new ProfileService(database);
    const type = request.headers.get("content-type")?.split(";")[0].trim();
    let data: unknown;
    if (["image/jpeg", "image/png", "image/webp"].includes(type || "")) {
      data = await service.update(auth, { image: await profileAvatar(await readBody(request, 5 * 1024 * 1024)) });
    } else {
      if (type !== "application/json") throw new ProfileError("不支持此文件格式。", 415);
      let body: Record<string, unknown>;
      try { body = JSON.parse((await readBody(request, 4096)).toString("utf8")); }
      catch (error) { if (error instanceof ProfileError) throw error; throw new ProfileError("请求格式不正确。"); }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new ProfileError("请求格式不正确。");
      if (body.action === "name") data = await service.update(auth, { displayName: profileName(body.name) });
      else if (body.action === "avatar-remove") data = await service.update(auth, { image: null });
      else if (body.action === "email-start") {
        if (!consumeRateLimit(`profile-email:${auth.userId}`, 5, 3_600_000)) throw new ProfileError("验证码请求过于频繁，请稍后重试。", 429);
        data = await service.startEmail(auth, { email: body.email, currentPassword: body.currentPassword });
      } else if (body.action === "email-confirm") data = await service.completeEmail(auth, { email: body.email, code: body.code, currentEmailCode: body.currentEmailCode });
      else throw new ProfileError("未知的资料操作。");
    }
    return NextResponse.json({ success: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const failure = error instanceof ProfileError ? error : postgresCode(error) === "23505" ? new ProfileError("该邮箱已被其他账户使用。", 409) : new ProfileError("保存失败，请稍后重试。", 500);
    return NextResponse.json({ success: false, message: failure.message }, { status: failure.status, headers: { "cache-control": "no-store" } });
  }
}
