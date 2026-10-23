import { describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import {
  authenticateGitHubOAuth,
  authenticateGoogleOAuth,
  isGitHubOAuthConfigured,
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
    isServiceAccount: false,
    currentOrganizationId: null,
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

  it("detects GitHub credentials separately from Google", () => {
    expect(isGitHubOAuthConfigured({})).toBe(false);
    expect(isGitHubOAuthConfigured({ AUTH_GITHUB_ID: "id", AUTH_GITHUB_SECRET: "secret" })).toBe(true);
    expect(isGitHubOAuthConfigured({ AUTH_GITHUB_ID: "id", AUTH_GITHUB_SECRET: "  " })).toBe(false);
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

  it("links a GitHub identity with provider github", async () => {
    const user = platformUser({ passwordHash: "hash" });
    const repository = {
      users: {
        findById: vi.fn(),
        findByEmail: vi.fn().mockResolvedValue(user),
        recordSuccessfulLogin: vi.fn().mockResolvedValue(undefined),
      },
      identities: {
        findByProviderAccount: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "id-gh" }),
      },
      provision: vi.fn(),
    };

    const authenticated = await authenticateGitHubOAuth(
      { providerAccountId: "gh-99", email: "alice@example.com", usernameHint: "Alice-W" },
      repository,
    );

    expect(authenticated?.id).toBe(user.id);
    expect(repository.identities.create).toHaveBeenCalledWith({
      userId: user.id,
      provider: "github",
      providerAccountId: "gh-99",
    });
  });

  it("retries a GitHub username collision wrapped by Drizzle without linking the existing username", async () => {
    const created = platformUser({ id: "new-github-user", username: "alice-w-abcdef" });
    const conflict = Object.assign(new Error("duplicate username"), {
      code: "23505", constraint: "users_username_unique",
    });
    const repository = {
      users: { findById: vi.fn(), findByEmail: vi.fn().mockResolvedValue(null), recordSuccessfulLogin: vi.fn() },
      identities: { findByProviderAccount: vi.fn().mockResolvedValue(null), create: vi.fn() },
      provision: vi.fn()
        .mockRejectedValueOnce(new DrizzleQueryError("insert into users", [], conflict))
        .mockResolvedValueOnce(created),
    };

    const user = await authenticateGitHubOAuth({
      providerAccountId: "github-new", email: "new@example.com", usernameHint: "Alice-W",
    }, repository);

    expect(user?.id).toBe(created.id);
    expect(repository.provision).toHaveBeenCalledTimes(2);
    expect(repository.provision.mock.calls[0][0].username).toBe("alice-w");
    expect(repository.provision.mock.calls[1][0].username).toMatch(/^alice-w-[a-f0-9]{6}$/);
    expect(repository.identities.create).toHaveBeenCalledWith({
      userId: created.id, provider: "github", providerAccountId: "github-new",
    });
  });

  it.each(["users_email_unique", "not_a_unique_violation"])("does not retry unrelated database errors (%s)", async (constraint) => {
    const cause = Object.assign(new Error("database failure"), {
      code: constraint === "users_email_unique" ? "23505" : "08006", constraint,
    });
    const failure = new DrizzleQueryError("insert into users", [], cause);
    const repository = {
      users: { findById: vi.fn(), findByEmail: vi.fn().mockResolvedValue(null), recordSuccessfulLogin: vi.fn() },
      identities: { findByProviderAccount: vi.fn().mockResolvedValue(null), create: vi.fn() },
      provision: vi.fn().mockRejectedValue(failure),
    };
    await expect(authenticateGitHubOAuth({
      providerAccountId: "github-new", email: "new@example.com", usernameHint: "Alice-W",
    }, repository)).rejects.toBe(failure);
    expect(repository.provision).toHaveBeenCalledTimes(1);
    expect(repository.identities.create).not.toHaveBeenCalled();
  });

  it("stops retrying repeated wrapped username conflicts after six attempts", async () => {
    const failure = new DrizzleQueryError("insert into users", [], Object.assign(new Error("duplicate username"), {
      code: "23505", constraint: "users_username_unique",
    }));
    const repository = {
      users: { findById: vi.fn(), findByEmail: vi.fn().mockResolvedValue(null), recordSuccessfulLogin: vi.fn() },
      identities: { findByProviderAccount: vi.fn().mockResolvedValue(null), create: vi.fn() },
      provision: vi.fn().mockRejectedValue(failure),
    };
    await expect(authenticateGitHubOAuth({
      providerAccountId: "github-new", email: "new@example.com", usernameHint: "Alice-W",
    }, repository)).rejects.toBe(failure);
    expect(repository.provision).toHaveBeenCalledTimes(6);
    expect(repository.identities.create).not.toHaveBeenCalled();
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
