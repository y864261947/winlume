import bcrypt from "bcryptjs";
import type { PlatformAuthUser, PlatformRole, PlatformSessionClaims, UserStatus } from "./types";
import { getPlatformRepositories } from "./repositories";
import { normalizeUsername, type PlatformUserRecord } from "./repositories/users";

export type AuthMode = "reizo" | "legacy";
type Environment = Readonly<Record<string, string | undefined>>;

export function getAuthMode(env: Environment = process.env): AuthMode {
  return env.REIZO_AUTH_MODE?.trim().toLowerCase() === "legacy" ? "legacy" : "reizo";
}

export function getBcryptCost(env: Environment = process.env): number {
  const configured = Number.parseInt(env.REIZO_BCRYPT_COST ?? "", 10);
  if (Number.isInteger(configured) && configured >= 4 && configured <= 16) return configured;
  return 12;
}

const bcryptHashPattern = /^\$2[abxy]\$\d{2}\$/;

export function isBcryptHash(value: string | null | undefined): value is string {
  return typeof value === "string" && bcryptHashPattern.test(value);
}

export function passwordWouldBeTruncatedByBcrypt(password: string): boolean {
  return bcrypt.truncates(password);
}

export async function hashPassword(password: string, cost = getBcryptCost()): Promise<string> {
  if (!password) throw new Error("A password is required.");
  if (passwordWouldBeTruncatedByBcrypt(password)) {
    throw new Error("Passwords must be no longer than 72 UTF-8 bytes.");
  }
  return bcrypt.hash(password, cost);
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined): Promise<boolean> {
  if (!password || !isBcryptHash(passwordHash)) return false;
  try {
    return await bcrypt.compare(password, passwordHash);
  } catch {
    return false;
  }
}

export function needsPasswordRehash(passwordHash: string | null | undefined, cost = getBcryptCost()): boolean {
  if (!isBcryptHash(passwordHash)) return false;
  try {
    return bcrypt.getRounds(passwordHash) < cost;
  } catch {
    return false;
  }
}

export interface PlatformCredentialInput {
  username: string;
  password: string;
}

export interface CredentialUserRepository {
  findByUsername(username: string): Promise<PlatformUserRecord | null>;
  findByEmail(email: string): Promise<PlatformUserRecord | null>;
  recordSuccessfulLogin(userId: string): Promise<void>;
  replacePasswordHashAfterLogin(userId: string, previousHash: string, nextHash: string): Promise<boolean>;
}

function looksLikeEmail(value: string): boolean {
  return value.includes("@");
}

function toPlatformAuthUser(user: PlatformUserRecord): PlatformAuthUser {
  const displayName = user.displayName || user.username;
  return {
    id: user.id,
    name: displayName,
    username: user.username,
    displayName,
    email: user.email ?? null,
    platformRole: user.platformRole,
    status: user.status,
    authVersion: user.authVersion,
    legacyNewApiUserId: user.legacyNewApiUserId ?? null,
  };
}

export async function authenticatePlatformCredentials(
  input: PlatformCredentialInput,
  repository?: CredentialUserRepository,
): Promise<PlatformAuthUser | null> {
  const identifier = input.username.trim();
  if (!identifier || !input.password) return null;

  const users = repository ?? getPlatformRepositories()?.users;
  if (!users) return null;
  const user = looksLikeEmail(identifier)
    ? await users.findByEmail(identifier)
    : await users.findByUsername(normalizeUsername(identifier));
  if (!user || user.status !== "active" || !user.passwordHash) return null;
  if (!(await verifyPassword(input.password, user.passwordHash))) return null;

  if (needsPasswordRehash(user.passwordHash)) {
    try {
      const replacement = await hashPassword(input.password);
      await users.replacePasswordHashAfterLogin(user.id, user.passwordHash, replacement);
    } catch {
      // A successful login must not be blocked by a best-effort hash upgrade.
    }
  }
  try {
    await users.recordSuccessfulLogin(user.id);
  } catch {
    // Login metadata is non-critical and can be repaired asynchronously.
  }
  return toPlatformAuthUser(user);
}

export function sessionClaimsFromUser(user: PlatformAuthUser): PlatformSessionClaims {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.name || user.username,
    email: user.email ?? null,
    platformRole: user.platformRole,
    status: user.status,
    authVersion: user.authVersion,
    legacyNewApiUserId: user.legacyNewApiUserId ?? null,
  };
}

function isPlatformRole(value: unknown): value is PlatformRole {
  return value === "user" || value === "admin";
}

function isUserStatus(value: unknown): value is UserStatus {
  return value === "active" || value === "suspended" || value === "pending";
}

/** Read only the narrow, validated claims that Auth.js forwards to the client. */
export function sessionClaimsFromToken(token: Record<string, unknown>): PlatformSessionClaims | null {
  const id = typeof token.sub === "string" ? token.sub.trim() : "";
  if (!id) return null;
  const username = typeof token.username === "string" && token.username.trim() ? token.username : id;
  const displayName = typeof token.displayName === "string" && token.displayName.trim()
    ? token.displayName
    : username;
  const rawVersion = typeof token.authVersion === "number" ? token.authVersion : Number(token.authVersion);
  const authVersion = Number.isInteger(rawVersion) && rawVersion >= 0 ? rawVersion : 0;
  const legacyId = typeof token.legacyNewApiUserId === "number" && Number.isInteger(token.legacyNewApiUserId)
    ? token.legacyNewApiUserId
    : null;
  return {
    id,
    username,
    displayName,
    email: typeof token.email === "string" ? token.email : null,
    platformRole: isPlatformRole(token.platformRole) ? token.platformRole : "user",
    status: isUserStatus(token.status) ? token.status : "active",
    authVersion,
    legacyNewApiUserId: legacyId,
  };
}

export function applySessionClaimsToToken(
  token: Record<string, unknown>,
  user: PlatformAuthUser,
): Record<string, unknown> {
  const claims = sessionClaimsFromUser(user);
  return {
    ...token,
    sub: claims.id,
    username: claims.username,
    displayName: claims.displayName,
    email: claims.email,
    platformRole: claims.platformRole,
    status: claims.status,
    authVersion: claims.authVersion,
    legacyNewApiUserId: claims.legacyNewApiUserId,
  };
}

export type { PlatformAuthUser, PlatformRole, PlatformSessionClaims, UserStatus };
