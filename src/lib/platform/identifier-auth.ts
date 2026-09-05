import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { hashPassword, passwordWouldBeTruncatedByBcrypt } from "./auth";
import { isMailConfigured, sendTransactionalEmail, verificationEmailCopy } from "./mail";
import { provisionPlatformUser } from "./provision";
import type { AuthChallengePurpose, AuthChallengeRecord } from "./repositories/auth-challenges";
import { normalizeEmail, normalizeUsername, type PlatformUserRecord } from "./repositories/users";
import { getPlatformDb, type PlatformDatabase } from "./db/client";

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/;
export const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export type IdentifyStatus = "password" | "oauth" | "register" | "unknown_username";

export type IdentifyResult = {
  status: IdentifyStatus;
  identifierType: "email" | "username";
  identifier: string;
  maskedEmail?: string;
};

export class IdentifierAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

type Environment = Readonly<Record<string, string | undefined>>;

export function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  return `${local.slice(0, 1)}***@${domain}`;
}

export function generateNumericCode(length = 6): string {
  const max = 10 ** length;
  return String(randomInt(0, max)).padStart(length, "0");
}

export function hashAuthCode(code: string, email: string, env: Environment = process.env): string {
  const secret = env.AUTH_SECRET || env.NEXTAUTH_SECRET || "reizo-dev-auth-secret";
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

function codesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function debugCodesEnabled(env: Environment = process.env): boolean {
  return env.NODE_ENV !== "production";
}

export interface IdentifierAuthUsers {
  findByEmail(email: string): Promise<PlatformUserRecord | null>;
  findByUsername(username: string): Promise<PlatformUserRecord | null>;
  setPasswordHash?(userId: string, passwordHash: string): Promise<void>;
  markEmailVerified?(userId: string, at?: Date): Promise<void>;
}

export interface IdentifierAuthChallenges {
  replace(input: {
    purpose: AuthChallengePurpose;
    email: string;
    username?: string | null;
    passwordHash?: string | null;
    codeHash: string;
    expiresAt: Date;
    lastSentAt?: Date;
  }): Promise<AuthChallengeRecord>;
  findActive(purpose: AuthChallengePurpose, email: string, now?: Date): Promise<AuthChallengeRecord | null>;
  incrementAttempts(id: string): Promise<number>;
  deleteById(id: string): Promise<void>;
}

export async function identifyAccount(
  rawIdentifier: string,
  users: IdentifierAuthUsers,
): Promise<IdentifyResult> {
  const trimmed = rawIdentifier.trim();
  if (!trimmed) {
    throw new IdentifierAuthError("请输入邮箱或用户名。", 400, "missing_identifier");
  }

  if (looksLikeEmail(trimmed)) {
    const email = normalizeEmail(trimmed);
    if (!email || !EMAIL_PATTERN.test(email) || email.length > 320) {
      throw new IdentifierAuthError("请输入有效的邮箱地址。", 400, "invalid_email");
    }
    const user = await users.findByEmail(email);
    if (!user || user.status !== "active") {
      return { status: "register", identifierType: "email", identifier: email };
    }
    if (!user.passwordHash) {
      return {
        status: "oauth",
        identifierType: "email",
        identifier: email,
        maskedEmail: maskEmail(email),
      };
    }
    return {
      status: "password",
      identifierType: "email",
      identifier: email,
      maskedEmail: maskEmail(email),
    };
  }

  const username = normalizeUsername(trimmed);
  if (!username || username.length < 3) {
    throw new IdentifierAuthError("请输入邮箱或用户名。", 400, "invalid_identifier");
  }
  const user = await users.findByUsername(username);
  if (!user || user.status !== "active") {
    return { status: "unknown_username", identifierType: "username", identifier: username };
  }
  if (!user.passwordHash) {
    return {
      status: "oauth",
      identifierType: "username",
      identifier: username,
      maskedEmail: user.email ? maskEmail(user.email) : undefined,
    };
  }
  return {
    status: "password",
    identifierType: "username",
    identifier: username,
    maskedEmail: user.email ? maskEmail(user.email) : undefined,
  };
}

async function issueChallenge(input: {
  purpose: AuthChallengePurpose;
  email: string;
  username?: string | null;
  passwordHash?: string | null;
  challenges: IdentifierAuthChallenges;
  env?: Environment;
  sendMail?: typeof sendTransactionalEmail;
}): Promise<{ debugCode?: string }> {
  const env = input.env ?? process.env;
  const existing = await input.challenges.findActive(input.purpose, input.email);
  if (existing && Date.now() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
    throw new IdentifierAuthError("验证码刚刚发过，请稍后再试。", 429, "resend_cooldown");
  }

  const code = generateNumericCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await input.challenges.replace({
    purpose: input.purpose,
    email: input.email,
    username: input.username,
    passwordHash: input.passwordHash,
    codeHash: hashAuthCode(code, input.email, env),
    expiresAt,
  });

  const copy = verificationEmailCopy(code, input.purpose);
  const send = input.sendMail ?? sendTransactionalEmail;
  const sent = await send({ to: input.email, ...copy }, env);
  if (!sent && !debugCodesEnabled(env) && isMailConfigured(env)) {
    throw new IdentifierAuthError("验证码发送失败，请稍后重试。", 502, "mail_failed");
  }
  if (!sent && !isMailConfigured(env) && !debugCodesEnabled(env)) {
    throw new IdentifierAuthError("邮件服务尚未配置。", 503, "mail_unconfigured");
  }
  return debugCodesEnabled(env) ? { debugCode: code } : {};
}

export async function startSignup(input: {
  email: string;
  username: string;
  password: string;
  users: IdentifierAuthUsers;
  challenges: IdentifierAuthChallenges;
  env?: Environment;
  sendMail?: typeof sendTransactionalEmail;
  provision?: typeof provisionPlatformUser;
  database?: PlatformDatabase | null;
}): Promise<{ status: "needs_verification" | "created"; debugCode?: string }> {
  const email = normalizeEmail(input.email);
  const username = normalizeUsername(input.username);
  const password = input.password;
  if (!email || !EMAIL_PATTERN.test(email) || email.length > 320) {
    throw new IdentifierAuthError("请输入有效的邮箱地址。", 400, "invalid_email");
  }
  if (!username || !USERNAME_PATTERN.test(username)) {
    throw new IdentifierAuthError("用户名需为 3 至 64 位，仅可使用小写字母、数字、点、下划线或连字符。", 400, "invalid_username");
  }
  if (password.length < 8 || password.length > 128 || passwordWouldBeTruncatedByBcrypt(password)) {
    throw new IdentifierAuthError("密码需为 8 至 72 个 UTF-8 字节。", 400, "invalid_password");
  }

  const [byEmail, byUsername] = await Promise.all([
    input.users.findByEmail(email),
    input.users.findByUsername(username),
  ]);
  if (byEmail) throw new IdentifierAuthError("该邮箱已有账户，请直接登录。", 409, "email_taken");
  if (byUsername) throw new IdentifierAuthError("该用户名已被使用。", 409, "username_taken");

  const env = input.env ?? process.env;
  const passwordHash = await hashPassword(password);

  if (!isMailConfigured(env) && env.NODE_ENV === "production") {
    const database = input.database ?? getPlatformDb();
    if (!database) throw new IdentifierAuthError("平台数据库尚未配置。", 503, "database_missing");
    const provision = input.provision ?? provisionPlatformUser;
    await provision(database, { username, email, displayName: username, passwordHash });
    return { status: "created" };
  }

  const issued = await issueChallenge({
    purpose: "signup",
    email,
    username,
    passwordHash,
    challenges: input.challenges,
    env,
    sendMail: input.sendMail,
  });
  return { status: "needs_verification", ...issued };
}

export async function resendSignupCode(input: {
  email: string;
  challenges: IdentifierAuthChallenges;
  env?: Environment;
  sendMail?: typeof sendTransactionalEmail;
}): Promise<{ debugCode?: string }> {
  const email = normalizeEmail(input.email);
  if (!email) throw new IdentifierAuthError("请输入有效的邮箱地址。", 400, "invalid_email");
  const existing = await input.challenges.findActive("signup", email);
  if (!existing?.passwordHash || !existing.username) {
    throw new IdentifierAuthError("请先填写用户名和密码。", 400, "missing_signup");
  }
  return issueChallenge({
    purpose: "signup",
    email,
    username: existing.username,
    passwordHash: existing.passwordHash,
    challenges: input.challenges,
    env: input.env,
    sendMail: input.sendMail,
  });
}

export async function verifySignup(input: {
  email: string;
  code: string;
  users: IdentifierAuthUsers;
  challenges: IdentifierAuthChallenges;
  env?: Environment;
  provision?: typeof provisionPlatformUser;
  database?: PlatformDatabase | null;
}): Promise<{ username: string }> {
  const email = normalizeEmail(input.email);
  const code = input.code.trim();
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new IdentifierAuthError("请输入有效的邮箱地址。", 400, "invalid_email");
  }
  if (!/^\d{6}$/.test(code)) {
    throw new IdentifierAuthError("请输入 6 位验证码。", 400, "invalid_code");
  }

  const challenge = await input.challenges.findActive("signup", email);
  if (!challenge?.username || !challenge.passwordHash) {
    throw new IdentifierAuthError("验证码无效或已过期，请重新获取。", 400, "expired_code");
  }
  if (challenge.attemptCount >= MAX_ATTEMPTS) {
    await input.challenges.deleteById(challenge.id);
    throw new IdentifierAuthError("验证次数过多，请重新获取验证码。", 429, "too_many_attempts");
  }

  const expected = hashAuthCode(code, email, input.env);
  if (!codesEqual(expected, challenge.codeHash)) {
    await input.challenges.incrementAttempts(challenge.id);
    throw new IdentifierAuthError("验证码不正确。", 400, "wrong_code");
  }

  const [byEmail, byUsername] = await Promise.all([
    input.users.findByEmail(email),
    input.users.findByUsername(challenge.username),
  ]);
  if (byEmail) {
    await input.challenges.deleteById(challenge.id);
    throw new IdentifierAuthError("该邮箱已有账户，请直接登录。", 409, "email_taken");
  }
  if (byUsername) {
    await input.challenges.deleteById(challenge.id);
    throw new IdentifierAuthError("该用户名已被使用。", 409, "username_taken");
  }

  const database = input.database ?? getPlatformDb();
  if (!database) throw new IdentifierAuthError("平台数据库尚未配置。", 503, "database_missing");
  const provision = input.provision ?? provisionPlatformUser;
  try {
    await provision(database, {
      username: challenge.username,
      email,
      displayName: challenge.username,
      passwordHash: challenge.passwordHash,
      emailVerifiedAt: new Date(),
    });
  } catch (error) {
    const pgCode = typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: string }).code
      : undefined;
    if (pgCode === "23505") {
      throw new IdentifierAuthError("用户名或邮箱已被使用。", 409, "taken");
    }
    throw error;
  }
  await input.challenges.deleteById(challenge.id);
  return { username: challenge.username };
}

export async function startPasswordReset(input: {
  identifier: string;
  users: IdentifierAuthUsers;
  challenges: IdentifierAuthChallenges;
  env?: Environment;
  sendMail?: typeof sendTransactionalEmail;
}): Promise<{ status: "sent"; maskedEmail?: string; debugCode?: string }> {
  const identified = await identifyAccount(input.identifier, input.users);
  const generic = { status: "sent" as const };

  if (identified.status === "register" || identified.status === "unknown_username") {
    return generic;
  }

  const users = input.users;
  const user = identified.identifierType === "email"
    ? await users.findByEmail(identified.identifier)
    : await users.findByUsername(identified.identifier);
  const email = normalizeEmail(user?.email);
  if (!email) return generic;

  const issued = await issueChallenge({
    purpose: "password_reset",
    email,
    challenges: input.challenges,
    env: input.env,
    sendMail: input.sendMail,
  });
  return { ...generic, maskedEmail: maskEmail(email), ...issued };
}

export async function completePasswordReset(input: {
  identifier: string;
  code: string;
  password: string;
  users: IdentifierAuthUsers;
  challenges: IdentifierAuthChallenges;
  env?: Environment;
}): Promise<void> {
  const identified = await identifyAccount(input.identifier, input.users);
  if (identified.status === "register" || identified.status === "unknown_username") {
    throw new IdentifierAuthError("验证码无效或已过期，请重新获取。", 400, "expired_code");
  }
  const owner = identified.identifierType === "email"
    ? await input.users.findByEmail(identified.identifier)
    : await input.users.findByUsername(identified.identifier);
  const email = normalizeEmail(owner?.email);
  const code = input.code.trim();
  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new IdentifierAuthError("验证码无效或已过期，请重新获取。", 400, "expired_code");
  }
  if (!/^\d{6}$/.test(code)) {
    throw new IdentifierAuthError("请输入 6 位验证码。", 400, "invalid_code");
  }
  if (input.password.length < 8 || input.password.length > 128 || passwordWouldBeTruncatedByBcrypt(input.password)) {
    throw new IdentifierAuthError("密码需为 8 至 72 个 UTF-8 字节。", 400, "invalid_password");
  }
  if (!input.users.setPasswordHash) {
    throw new IdentifierAuthError("平台账户服务暂不可用。", 503, "database_missing");
  }

  const challenge = await input.challenges.findActive("password_reset", email);
  if (!challenge) {
    throw new IdentifierAuthError("验证码无效或已过期，请重新获取。", 400, "expired_code");
  }
  if (challenge.attemptCount >= MAX_ATTEMPTS) {
    await input.challenges.deleteById(challenge.id);
    throw new IdentifierAuthError("验证次数过多，请重新获取验证码。", 429, "too_many_attempts");
  }
  const expected = hashAuthCode(code, email, input.env);
  if (!codesEqual(expected, challenge.codeHash)) {
    await input.challenges.incrementAttempts(challenge.id);
    throw new IdentifierAuthError("验证码不正确。", 400, "wrong_code");
  }

  if (!owner || owner.status !== "active") {
    await input.challenges.deleteById(challenge.id);
    throw new IdentifierAuthError("验证码无效或已过期，请重新获取。", 400, "expired_code");
  }

  await input.users.setPasswordHash(owner.id, await hashPassword(input.password));
  await input.users.markEmailVerified?.(owner.id);
  await input.challenges.deleteById(challenge.id);
}


