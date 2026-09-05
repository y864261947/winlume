import { describe, expect, it, vi } from "vitest";
import {
  applySessionClaimsToToken,
  authenticatePlatformCredentials,
  getAuthMode,
  hashPassword,
  needsPasswordRehash,
  sessionClaimsFromToken,
  verifyPassword,
} from "./auth";
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
    passwordHash: null,
    status: "active",
    platformRole: "user",
    isServiceAccount: false,
    currentOrganizationId: null,
    authVersion: 3,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("Reizo credential helpers", () => {
  it("accepts bcrypt hashes emitted by the legacy Go service", async () => {
    const currentHash = await hashPassword("correct horse battery staple", 4);
    const goCompatibleHash = currentHash.replace(/^\$2b\$/, "$2a$");
    expect(await verifyPassword("correct horse battery staple", goCompatibleHash)).toBe(true);
    expect(await verifyPassword("wrong", goCompatibleHash)).toBe(false);
    expect(needsPasswordRehash(goCompatibleHash, 5)).toBe(true);
    expect(needsPasswordRehash(goCompatibleHash, 4)).toBe(false);
  });

  it("does not create hashes for passwords bcrypt would truncate", async () => {
    await expect(hashPassword("a".repeat(73), 4)).rejects.toThrow("72 UTF-8 bytes");
  });

  it("authenticates active local users and returns durable session claims", async () => {
    const passwordHash = await hashPassword("s3cret", 4);
    const user = platformUser({ passwordHash, platformRole: "admin" });
    const repository = {
      findByUsername: vi.fn().mockResolvedValue(user),
      findByEmail: vi.fn(),
      recordSuccessfulLogin: vi.fn().mockResolvedValue(undefined),
      replacePasswordHashAfterLogin: vi.fn().mockResolvedValue(true),
    };

    const authenticated = await authenticatePlatformCredentials(
      { username: " Alice ", password: "s3cret" },
      repository,
    );

    expect(authenticated).toMatchObject({ id: user.id, username: "alice", platformRole: "admin", authVersion: 3 });
    expect(repository.findByUsername).toHaveBeenCalledWith("alice");
    expect(repository.recordSuccessfulLogin).toHaveBeenCalledWith(user.id);
  });

  it("rejects suspended users before issuing claims", async () => {
    const repository = {
      findByUsername: vi.fn().mockResolvedValue(platformUser({ status: "suspended" })),
      findByEmail: vi.fn(),
      recordSuccessfulLogin: vi.fn(),
      replacePasswordHashAfterLogin: vi.fn(),
    };
    await expect(authenticatePlatformCredentials({ username: "alice", password: "anything" }, repository)).resolves.toBeNull();
    expect(repository.recordSuccessfulLogin).not.toHaveBeenCalled();
  });

  it("writes and validates only the intended JWT claims", () => {
    const token = applySessionClaimsToToken(
      { sub: "old-user", unrelated: "kept" },
      {
        id: "user-1",
        name: "Alice",
        username: "alice",
        displayName: "Alice Wang",
        email: "alice@example.com",
        platformRole: "admin",
        status: "active",
        authVersion: 5,
        legacyNewApiUserId: 42,
      },
    );
    expect(sessionClaimsFromToken(token)).toEqual({
      id: "user-1",
      username: "alice",
      displayName: "Alice Wang",
      email: "alice@example.com",
      platformRole: "admin",
      status: "active",
      authVersion: 5,
      legacyNewApiUserId: 42,
    });
    expect(sessionClaimsFromToken({ sub: "user-1", platformRole: "unexpected", authVersion: -1 }))
      .toMatchObject({ platformRole: "user", authVersion: 0 });
  });

  it("uses the database mode unless legacy is explicitly requested", () => {
    expect(getAuthMode({})).toBe("reizo");
    expect(getAuthMode({ REIZO_AUTH_MODE: "legacy" })).toBe("legacy");
    expect(getAuthMode({ REIZO_AUTH_MODE: "new-api" })).toBe("reizo");
  });

  it("authenticates by email when the identifier contains @", async () => {
    const passwordHash = await hashPassword("s3cret", 4);
    const user = platformUser({ passwordHash });
    const repository = {
      findByUsername: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue(user),
      recordSuccessfulLogin: vi.fn().mockResolvedValue(undefined),
      replacePasswordHashAfterLogin: vi.fn().mockResolvedValue(true),
    };
    const authenticated = await authenticatePlatformCredentials(
      { username: "Alice@example.com", password: "s3cret" },
      repository,
    );
    expect(authenticated?.username).toBe("alice");
    expect(repository.findByEmail).toHaveBeenCalledWith("Alice@example.com");
    expect(repository.findByUsername).not.toHaveBeenCalled();
  });
});
