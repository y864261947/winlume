import { randomBytes } from "node:crypto";
import type { PlatformAuthUser } from "./types";
import { getPlatformDb } from "./db/client";
import { provisionPlatformUser } from "./provision";
import { GOOGLE_AUTH_PROVIDER, GITHUB_AUTH_PROVIDER } from "./repositories/auth-identities";
import {
  normalizeEmail,
  normalizeUsername,
  type PlatformUserRecord,
  UserRepository,
} from "./repositories/users";
import { AuthIdentityRepository } from "./repositories/auth-identities";

type Environment = Readonly<Record<string, string | undefined>>;

export type SocialAuthProvider = typeof GOOGLE_AUTH_PROVIDER | typeof GITHUB_AUTH_PROVIDER;

export interface SocialOAuthProfileInput {
  provider: SocialAuthProvider;
  providerAccountId: string;
  email: string | null | undefined;
  name?: string | null;
  image?: string | null;
  emailVerified?: boolean;
  usernameHint?: string | null;
}

export function isGoogleOAuthConfigured(env: Environment = process.env): boolean {
  return Boolean(env.AUTH_GOOGLE_ID?.trim() && env.AUTH_GOOGLE_SECRET?.trim());
}

export function isGitHubOAuthConfigured(env: Environment = process.env): boolean {
  return Boolean(env.AUTH_GITHUB_ID?.trim() && env.AUTH_GITHUB_SECRET?.trim());
}

export function getGoogleOAuthCredentials(env: Environment = process.env): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = env.AUTH_GOOGLE_ID?.trim() ?? "";
  const clientSecret = env.AUTH_GOOGLE_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function getGitHubOAuthCredentials(env: Environment = process.env): {
  clientId: string;
  clientSecret: string;
} | null {
  const clientId = env.AUTH_GITHUB_ID?.trim() ?? "";
  const clientSecret = env.AUTH_GITHUB_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function usernameStemFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "user";
  return sanitizeUsernameStem(local, "g");
}

/** @deprecated Use usernameStemFromEmail. */
export const usernameStemFromGoogleEmail = usernameStemFromEmail;

export function usernameStemFromGithubLogin(login: string): string {
  return sanitizeUsernameStem(login, "gh");
}

function sanitizeUsernameStem(raw: string, prefix: string): string {
  let stem = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "");
  if (!stem || stem.length < 3) {
    stem = `${prefix}${stem || "user"}`.replace(/[^a-z0-9._-]/g, "");
  }
  if (!/^[a-z0-9]/.test(stem)) {
    stem = `${prefix}${stem}`;
  }
  if (stem.length < 3) stem = `${stem}usr`.slice(0, 64);
  return stem.slice(0, 48);
}

function uniqueUsernameCandidate(stem: string): string {
  const suffix = randomBytes(3).toString("hex");
  const base = stem.slice(0, Math.max(3, 64 - 1 - suffix.length));
  return `${base}-${suffix}`.slice(0, 64);
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

export interface SocialOAuthRepositories {
  users: Pick<UserRepository, "findById" | "findByEmail" | "recordSuccessfulLogin">;
  identities: Pick<AuthIdentityRepository, "findByProviderAccount" | "create">;
  provision: (input: {
    username: string;
    displayName?: string;
    email?: string | null;
    image?: string | null;
    emailVerifiedAt?: Date | null;
  }) => Promise<PlatformUserRecord>;
}

function defaultRepositories(): SocialOAuthRepositories | null {
  const database = getPlatformDb();
  if (!database) return null;
  const users = new UserRepository(database);
  const identities = new AuthIdentityRepository(database);
  return {
    users,
    identities,
    provision: (input) => provisionPlatformUser(database, input),
  };
}

/**
 * Resolve or create a platform user for a social OAuth sign-in.
 * Idempotent on (provider, providerAccountId). Links by verified email when no identity exists yet.
 */
export async function authenticateSocialOAuth(
  input: SocialOAuthProfileInput,
  repository?: SocialOAuthRepositories,
): Promise<PlatformAuthUser | null> {
  const provider = input.provider;
  const providerAccountId = input.providerAccountId?.trim();
  if (!providerAccountId) return null;

  const email = normalizeEmail(input.email);
  if (!email) return null;
  if (input.emailVerified === false) return null;

  const repos = repository ?? defaultRepositories();
  if (!repos) return null;

  const existingIdentity = await repos.identities.findByProviderAccount(provider, providerAccountId);
  if (existingIdentity) {
    const user = await repos.users.findById(existingIdentity.userId);
    if (!user || user.status !== "active") return null;
    try {
      await repos.users.recordSuccessfulLogin(user.id);
    } catch {
      // Login metadata is non-critical.
    }
    return toPlatformAuthUser(user);
  }

  const byEmail = await repos.users.findByEmail(email);
  if (byEmail) {
    if (byEmail.status !== "active") return null;
    try {
      await repos.identities.create({
        userId: byEmail.id,
        provider,
        providerAccountId,
      });
    } catch (error) {
      const raced = await repos.identities.findByProviderAccount(provider, providerAccountId);
      if (!raced || raced.userId !== byEmail.id) throw error;
    }
    try {
      await repos.users.recordSuccessfulLogin(byEmail.id);
    } catch {
      // non-critical
    }
    return toPlatformAuthUser(byEmail);
  }

  const displayName = input.name?.trim() || email.split("@")[0] || "Reizo user";
  const hint = input.usernameHint?.trim();
  const stem = hint
    ? usernameStemFromGithubLogin(hint)
    : usernameStemFromEmail(email);
  let username = normalizeUsername(stem);
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
    username = uniqueUsernameCandidate(provider === "github" ? "ghuser" : "guser");
  }

  let created: PlatformUserRecord | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      created = await repos.provision({
        username: attempt === 0 ? username : uniqueUsernameCandidate(stem),
        displayName: displayName.slice(0, 120),
        email,
        image: input.image ?? null,
        emailVerifiedAt: new Date(),
      });
      break;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: string }).code
        : undefined;
      if (code === "23505" && attempt < 5) continue;
      throw error;
    }
  }
  if (!created) return null;

  try {
    await repos.identities.create({
      userId: created.id,
      provider,
      providerAccountId,
    });
  } catch (error) {
    const raced = await repos.identities.findByProviderAccount(provider, providerAccountId);
    if (raced) {
      const user = await repos.users.findById(raced.userId);
      if (user?.status === "active") return toPlatformAuthUser(user);
    }
    throw error;
  }

  try {
    await repos.users.recordSuccessfulLogin(created.id);
  } catch {
    // non-critical
  }
  return toPlatformAuthUser(created);
}

export async function authenticateGoogleOAuth(
  input: Omit<SocialOAuthProfileInput, "provider">,
  repository?: SocialOAuthRepositories,
): Promise<PlatformAuthUser | null> {
  return authenticateSocialOAuth({ ...input, provider: GOOGLE_AUTH_PROVIDER }, repository);
}

export async function authenticateGitHubOAuth(
  input: Omit<SocialOAuthProfileInput, "provider">,
  repository?: SocialOAuthRepositories,
): Promise<PlatformAuthUser | null> {
  return authenticateSocialOAuth({ ...input, provider: GITHUB_AUTH_PROVIDER }, repository);
}
