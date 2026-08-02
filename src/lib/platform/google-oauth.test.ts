import { describe, expect, it, vi } from "vitest";
import {
  authenticateGoogleOAuth,
  isGoogleOAuthConfigured,
  usernameStemFromGoogleEmail,
} from "./google-oauth";
import type { PlatformUserRecord } from "./repositories/users";

function platformUser(overrides: Partial<PlatformUserRecord> = {}): PlatformUserRecord {
  return {
    id: "4c1523de-5fd9-4ee6-9c9f-b6e808d3a1f0",
    legacyNewApiUserId: null,
    username: "alice",
    email: "alice@example.com",
    emailVerifiedAt: null,
    displayName: "Alice",
    image: null,
    passwordHash: null,
    status: "active",
    platformRole: "user",
    authVersion: 1,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("Google OAuth helpers", () => {
  it("detects configured credentials", () => {
    expect(isGoogleOAuthConfigured({})).toBe(false);
    expect(isGoogleOAuthConfigured({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "secret" })).toBe(true);
    expect(isGoogleOAuthConfigured({ AUTH_GOOGLE_ID: "  ", AUTH_GOOGLE_SECRET: "secret" })).toBe(false);
  });

  it("derives a safe username stem from email", () => {
    expect(usernameStemFromGoogleEmail("Alice.Wang+dev@gmail.com")).toMatch(/^[a-z0-9]/);
    expect(usernameStemFromGoogleEmail("ab@x.com").length).toBeGreaterThanOrEqual(3);
  });

  it("returns an existing linked identity user", async () => {
    const user = platformUser();
    const repository = {
      users: {
        findById: vi.fn().mockResolvedValue(user),
        findByEmail: vi.fn(),
        recordSuccessfulLogin: vi.fn().mockResolvedValue(undefined),
      },
      identities: {
        findByProviderAccount: vi.fn().mockResolvedValue({
          id: "id-1",
          userId: user.id,
          provider: "google",
          providerAccountId: "g-sub-1",
        }),
        create: vi.fn(),
      },
      provision: vi.fn(),
    };

    const authenticated = await authenticateGoogleOAuth(
      { providerAccountId: "g-sub-1", email: "alice@example.com" },
      repository,
    );

    expect(authenticated).toMatchObject({ id: user.id, username: "alice" });
    expect(repository.provision).not.toHaveBeenCalled();
    expect(repository.identities.create).not.toHaveBeenCalled();
    expect(repository.users.recordSuccessfulLogin).toHaveBeenCalledWith(user.id);
  });

  it("links Google identity to an existing email account", async () => {
    const user = platformUser({ passwordHash: "hash" });
    const repository = {
      users: {
        findById: vi.fn(),
        findByEmail: vi.fn().mockResolvedValue(user),
        recordSuccessfulLogin: vi.fn().mockResolvedValue(undefined),
      },
      identities: {
        findByProviderAccount: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "id-2" }),
      },
      provision: vi.fn(),
    };

    const authenticated = await authenticateGoogleOAuth(
      { providerAccountId: "g-sub-2", email: "Alice@Example.com", name: "Alice" },
      repository,
    );

    expect(authenticated?.id).toBe(user.id);
    expect(repository.identities.create).toHaveBeenCalledWith({
      userId: user.id,
      provider: "google",
      providerAccountId: "g-sub-2",
    });
    expect(repository.provision).not.toHaveBeenCalled();
  });

  it("provisions a new user on first Google sign-in", async () => {
    const created = platformUser({
      id: "new-user",
      username: "alicewang",
      email: "alice.wang@gmail.com",
      displayName: "Alice Wang",
    });
    const repository = {
      users: {
        findById: vi.fn(),
        findByEmail: vi.fn().mockResolvedValue(null),
        recordSuccessfulLogin: vi.fn().mockResolvedValue(undefined),
      },
      identities: {
        findByProviderAccount: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "id-3" }),
      },
      provision: vi.fn().mockResolvedValue(created),
    };

    const authenticated = await authenticateGoogleOAuth(
      {
        providerAccountId: "g-sub-3",
        email: "alice.wang@gmail.com",
        name: "Alice Wang",
        image: "https://example.com/a.png",
      },
      repository,
    );

    expect(authenticated).toMatchObject({ id: "new-user", username: "alicewang" });
    expect(repository.provision).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "alice.wang@gmail.com",
        displayName: "Alice Wang",
        image: "https://example.com/a.png",
      }),
    );
    expect(repository.identities.create).toHaveBeenCalledWith({
      userId: "new-user",
      provider: "google",
      providerAccountId: "g-sub-3",
    });
  });

  it("rejects unverified email and suspended users", async () => {
    await expect(
      authenticateGoogleOAuth(
        { providerAccountId: "g", email: "a@b.com", emailVerified: false },
        {
          users: { findById: vi.fn(), findByEmail: vi.fn(), recordSuccessfulLogin: vi.fn() },
          identities: { findByProviderAccount: vi.fn(), create: vi.fn() },
          provision: vi.fn(),
        },
      ),
    ).resolves.toBeNull();

    const suspended = platformUser({ status: "suspended" });
    await expect(
      authenticateGoogleOAuth(
        { providerAccountId: "g-sub", email: "alice@example.com" },
        {
          users: {
            findById: vi.fn().mockResolvedValue(suspended),
            findByEmail: vi.fn(),
            recordSuccessfulLogin: vi.fn(),
          },
          identities: {
            findByProviderAccount: vi.fn().mockResolvedValue({
              userId: suspended.id,
              provider: "google",
              providerAccountId: "g-sub",
            }),
            create: vi.fn(),
          },
          provision: vi.fn(),
        },
      ),
    ).resolves.toBeNull();
  });
});
