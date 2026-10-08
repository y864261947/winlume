import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { PlatformDatabase } from "./db/client";
import { emailChanges, users } from "./db/schema";
import { verifyPassword } from "./auth";
import { isMailConfigured, sendTransactionalEmail } from "./mail";
import { ProfileError, profileEmail } from "./profile-validation";

type Identity = { userId: string; authVersion: number };
type Dependencies = { sendMail?: typeof sendTransactionalEmail; env?: NodeJS.ProcessEnv };

export class ProfileService {
  private env: NodeJS.ProcessEnv;
  private sendMail: typeof sendTransactionalEmail;
  constructor(private db: PlatformDatabase, deps: Dependencies = {}) {
    this.env = deps.env ?? process.env;
    this.sendMail = deps.sendMail ?? sendTransactionalEmail;
  }

  private codeHash(value: string, context: string) {
    const secret = this.env.AUTH_SECRET || this.env.NEXTAUTH_SECRET;
    if (!secret) throw new ProfileError("账户验证服务暂不可用。", 503);
    return createHmac("sha256", secret).update(`${context}:${value}`).digest("hex");
  }

  async update(identity: Identity, patch: { displayName?: string; image?: string | null }) {
    const [user] = await this.db.update(users).set({ ...patch, updatedAt: new Date() })
      .where(and(eq(users.id, identity.userId), eq(users.authVersion, identity.authVersion), eq(users.status, "active")))
      .returning({ display_name: users.displayName, image: users.image });
    if (!user) throw new ProfileError("登录状态已失效，请重新登录。", 401);
    return user;
  }

  async startEmail(identity: Identity, input: { email: unknown; currentPassword?: unknown }) {
    const email = profileEmail(input.email);
    if (!isMailConfigured(this.env)) throw new ProfileError("邮件服务暂不可用，请稍后再试。", 503);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const previousCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const id = randomUUID();
    const challenge = await this.db.transaction(async tx => {
      const [user] = await tx.select().from(users).where(eq(users.id, identity.userId)).for("update");
      if (!user || user.status !== "active" || user.authVersion !== identity.authVersion) throw new ProfileError("请重新登录。", 401);
      if (email === user.email) throw new ProfileError("新邮箱与当前邮箱相同。");
      const [existing] = await tx.select().from(emailChanges).where(eq(emailChanges.userId, user.id));
      if (existing && Date.now() - existing.sentAt.getTime() < 60_000) throw new ProfileError("验证码已发送，请在 60 秒后重试。", 429);
      if (user.passwordHash) {
        const password = typeof input.currentPassword === "string" ? input.currentPassword : "";
        if (password.length > 128 || !(await verifyPassword(password, user.passwordHash))) throw new ProfileError("当前密码不正确。");
      } else if (!user.email) {
        throw new ProfileError("当前账户缺少可验证的登录方式，请联系支持。");
      }
      const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (taken) throw new ProfileError("该邮箱已被其他账户使用。", 409);
      const values = { id, userId: user.id, email, previousEmail: user.email, authVersion: user.authVersion,
        codeHash: this.codeHash(code, `${id}:new:${email}`),
        previousCodeHash: user.passwordHash ? null : this.codeHash(previousCode, `${id}:old:${user.email}`),
        attempts: 0, sentAt: new Date(), expiresAt: new Date(Date.now() + 600_000) };
      await tx.insert(emailChanges).values(values).onConflictDoUpdate({ target: emailChanges.userId, set: values });
      return values;
    });
    const deliver = async (to: string, value: string, action: string) => {
      const text = `你的 REIZO 验证码是 ${value}，10 分钟内有效，用于${action}。如果不是你本人操作，请勿向任何人提供验证码。`;
      if (!(await this.sendMail({ to, subject: `REIZO ${action}验证码`, text, html: `<p>${text}</p>` }, this.env))) throw new Error("Mail unavailable");
    };
    try {
      await deliver(email, code, "验证新邮箱");
      if (challenge.previousCodeHash && challenge.previousEmail) await deliver(challenge.previousEmail, previousCode, "确认更换邮箱");
    } catch {
      await this.db.delete(emailChanges).where(and(eq(emailChanges.userId, identity.userId), eq(emailChanges.id, id)));
      throw new ProfileError("验证码发送失败，请稍后重试。", 502);
    }
    return { email, requiresCurrentEmailCode: Boolean(challenge.previousCodeHash), expiresIn: 600, resendIn: 60 };
  }

  async completeEmail(identity: Identity, input: { email: unknown; code?: unknown; currentEmailCode?: unknown }) {
    const email = profileEmail(input.email);
    const result = await this.db.transaction(async tx => {
      // Lock in the same order as issuance, so concurrent submits cannot reuse a code.
      const [user] = await tx.select().from(users).where(eq(users.id, identity.userId)).for("update");
      if (!user || user.status !== "active" || user.authVersion !== identity.authVersion) throw new ProfileError("请重新登录。", 401);
      const [challenge] = await tx.select().from(emailChanges).where(eq(emailChanges.userId, user.id));
      if (!challenge || challenge.email !== email || challenge.expiresAt.getTime() <= Date.now() || challenge.previousEmail !== user.email || challenge.authVersion !== user.authVersion) throw new ProfileError("验证已失效，请重新获取验证码。");
      if (challenge.attempts >= 5) throw new ProfileError("验证次数过多，请重新获取验证码。", 429);
      const matches = (value: unknown, hash: string, context: string) => typeof value === "string" && /^\d{6}$/.test(value) && timingSafeEqual(Buffer.from(hash), Buffer.from(this.codeHash(value, context)));
      const valid = matches(input.code, challenge.codeHash, `${challenge.id}:new:${email}`)
        && (!challenge.previousCodeHash || matches(input.currentEmailCode, challenge.previousCodeHash, `${challenge.id}:old:${user.email}`));
      if (!valid) {
        await tx.update(emailChanges).set({ attempts: challenge.attempts + 1 }).where(eq(emailChanges.userId, user.id));
        // Commit the failed attempt before returning an error to the caller.
        return false;
      }
      const [taken] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email));
      if (taken) throw new ProfileError("该邮箱已被其他账户使用。", 409);
      await tx.update(users).set({ email, emailVerifiedAt: new Date(), updatedAt: new Date(), authVersion: sql`${users.authVersion} + 1` }).where(eq(users.id, user.id));
      await tx.delete(emailChanges).where(eq(emailChanges.userId, user.id));
      return true;
    });
    if (!result) throw new ProfileError("验证码不正确，请检查后重试。");
    return { changed: true, reauthenticate: true };
  }
}
