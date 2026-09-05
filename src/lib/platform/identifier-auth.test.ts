import { describe, expect, it, vi } from "vitest";
import {
  completePasswordReset,
  hashAuthCode,
  identifyAccount,
  IdentifierAuthError,
  maskEmail,
  startPasswordReset,
  startSignup,
  verifySignup,
  type IdentifierAuthChallenges,
} from "./identifier-auth";
import type { AuthChallengeRecord } from "./repositories/auth-challenges";
import type { PlatformUserRecord } from "./repositories/users";

function platformUser(overrides: Partial<PlatformUserRecord> = {}): PlatformUserRecord {
  return {
    id: "4c1523de-5fd9-4ee6-9c9f-b6e808d3a1f0",
    legacyNewApiUserId: 42,
    username: "alice",
    email: "alice@example.com",
    emailVerifiedAt: null,
    displayName: "Alice",
    image: null,
    passwordHash: "hashed",
    status: "active",
    platformRole: "user",
    isServiceAccount: false,
    currentOrganizationId: null,
    authVersion: 1,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function memoryChallenges(): IdentifierAuthChallenges & { records: AuthChallengeRecord[] } {
  const records: AuthChallengeRecord[] = [];
  return {
    records,
    async replace(input) {
      const next: AuthChallengeRecord = {
        id: `challenge-${records.length + 1}`,
        purpose: input.purpose,
        email: input.email,
        username: input.username ?? null,
        passwordHash: input.passwordHash ?? null,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        attemptCount: 0,
        lastSentAt: input.lastSentAt ?? new Date(),
        createdAt: new Date(),
      };
      const index = records.findIndex((row) => row.purpose === input.purpose && row.email === input.email);
      if (index >= 0) records.splice(index, 1, next);
      else records.push(next);
      return next;
    },
    async findActive(purpose, email, now = new Date()) {
      return records.find((row) => row.purpose === purpose && row.email === email && row.expiresAt > now) ?? null;
    },
    async incrementAttempts(id) {
      const row = records.find((item) => item.id === id);
      if (!row) return 0;
      row.attemptCount += 1;
      return row.attemptCount;
    },
    async deleteById(id) {
      const index = records.findIndex((item) => item.id === id);
      if (index >= 0) records.splice(index, 1);
    },
  };
}

describe("identifier-first auth", () => {
  it("masks emails without revealing the local part", () => {
    expect(maskEmail("alice@example.com")).toBe("a***@example.com");
  });

  it("sends existing password accounts to the password step", async () => {
    const users = {
      findByEmail: vi.fn().mockResolvedValue(platformUser()),
      findByUsername: vi.fn(),
    };
    await expect(identifyAccount("Alice@example.com", users)).resolves.toMatchObject({
      status: "password",
      identifierType: "email",
      identifier: "alice@example.com",
    });
  });

  it("sends oauth-only accounts to Google instead of a password field", async () => {
    const users = {
      findByEmail: vi.fn().mockResolvedValue(platformUser({ passwordHash: null })),
      findByUsername: vi.fn(),
    };
    await expect(identifyAccount("alice@example.com", users)).resolves.toMatchObject({ status: "oauth" });
  });

  it("starts registration when the email is new", async () => {
    const users = {
      findByEmail: vi.fn().mockResolvedValue(null),
      findByUsername: vi.fn(),
    };
    await expect(identifyAccount("new@example.com", users)).resolves.toMatchObject({
      status: "register",
      identifier: "new@example.com",
    });
  });

  it("does not start registration from an unknown username", async () => {
    const users = {
      findByEmail: vi.fn(),
      findByUsername: vi.fn().mockResolvedValue(null),
    };
    await expect(identifyAccount("nobody", users)).resolves.toMatchObject({
      status: "unknown_username",
      identifier: "nobody",
    });
  });

  it("stores a signup challenge and returns a debug code outside production", async () => {
    const users = {
      findByEmail: vi.fn().mockResolvedValue(null),
      findByUsername: vi.fn().mockResolvedValue(null),
    };
    const challenges = memoryChallenges();
    const sendMail = vi.fn().mockResolvedValue(false);
    const result = await startSignup({
      email: "new@example.com",
      username: "newuser",
      password: "correct horse",
      users,
      challenges,
      sendMail,
      env: { NODE_ENV: "test", AUTH_SECRET: "test-secret" },
    });
    expect(result.status).toBe("needs_verification");
    expect(result.debugCode).toMatch(/^\d{6}$/);
    expect(challenges.records).toHaveLength(1);
    expect(challenges.records[0]?.username).toBe("newuser");
  });

  it("provisions the user after a matching signup code", async () => {
    const users = {
      findByEmail: vi.fn().mockResolvedValue(null),
      findByUsername: vi.fn().mockResolvedValue(null),
    };
    const challenges = memoryChallenges();
    const env = { NODE_ENV: "test", AUTH_SECRET: "test-secret" };
    const started = await startSignup({
      email: "new@example.com",
      username: "newuser",
      password: "correct horse",
      users,
      challenges,
      sendMail: vi.fn().mockResolvedValue(true),
      env,
    });
    const provision = vi.fn().mockResolvedValue(platformUser({ username: "newuser", email: "new@example.com" }));
    const verified = await verifySignup({
      email: "new@example.com",
      code: started.debugCode ?? "",
      users,
      challenges,
      env,
      provision,
      database: {} as never,
    });
    expect(verified).toEqual({ username: "newuser" });
    expect(provision).toHaveBeenCalledTimes(1);
    expect(challenges.records).toHaveLength(0);
  });

  it("rejects a wrong signup code without revealing extra account state", async () => {
    const users = {
      findByEmail: vi.fn().mockResolvedValue(null),
      findByUsername: vi.fn().mockResolvedValue(null),
    };
    const challenges = memoryChallenges();
    const env = { NODE_ENV: "test", AUTH_SECRET: "test-secret" };
    await startSignup({
      email: "new@example.com",
      username: "newuser",
      password: "correct horse",
      users,
      challenges,
      sendMail: vi.fn().mockResolvedValue(true),
      env,
    });
    await expect(verifySignup({
      email: "new@example.com",
      code: "000000",
      users,
      challenges,
      env,
      provision: vi.fn(),
      database: {} as never,
    })).rejects.toMatchObject({ code: "wrong_code" } satisfies Partial<IdentifierAuthError>);
    expect(challenges.records[0]?.attemptCount).toBe(1);
  });

  it("always reports that a recovery email was sent", async () => {
    const users = {
      findByEmail: vi.fn().mockResolvedValue(null),
      findByUsername: vi.fn().mockResolvedValue(null),
    };
    const challenges = memoryChallenges();
    const sendMail = vi.fn();
    const result = await startPasswordReset({
      identifier: "missing@example.com",
      users,
      challenges,
      sendMail,
      env: { NODE_ENV: "test", AUTH_SECRET: "test-secret" },
    });
    expect(result.status).toBe("sent");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sets a new password after a valid recovery code", async () => {
    const user = platformUser();
    const users = {
      findByEmail: vi.fn().mockResolvedValue(user),
      findByUsername: vi.fn(),
      setPasswordHash: vi.fn().mockResolvedValue(undefined),
      markEmailVerified: vi.fn().mockResolvedValue(undefined),
    };
    const challenges = memoryChallenges();
    const env = { NODE_ENV: "test", AUTH_SECRET: "test-secret" };
    const started = await startPasswordReset({
      identifier: "alice@example.com",
      users,
      challenges,
      sendMail: vi.fn().mockResolvedValue(true),
      env,
    });
    await completePasswordReset({
      identifier: "alice@example.com",
      code: started.debugCode ?? "",
      password: "new-secret-1",
      users,
      challenges,
      env,
    });
    expect(users.setPasswordHash).toHaveBeenCalledWith(user.id, expect.any(String));
    expect(users.markEmailVerified).toHaveBeenCalledWith(user.id);
  });

  it("hashes codes with the auth secret", () => {
    const left = hashAuthCode("123456", "a@b.c", { AUTH_SECRET: "one" });
    const right = hashAuthCode("123456", "a@b.c", { AUTH_SECRET: "two" });
    expect(left).not.toBe(right);
    expect(left).toHaveLength(64);
  });
});
