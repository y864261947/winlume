import { getCurrentAuthContext, type CurrentAuthContext } from "@/lib/auth/session";

export class PlatformAdminError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PlatformAdminError";
  }
}

export async function requirePlatformAdmin(): Promise<CurrentAuthContext> {
  const user = await getCurrentAuthContext();
  if (!user) throw new PlatformAdminError("请先登录。", 401);
  if (user.platformRole !== "admin") {
    throw new PlatformAdminError("仅平台管理员可以管理 Skill。", 403);
  }
  return user;
}
