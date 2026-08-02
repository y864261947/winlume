import type { PlatformDatabase } from "./db/client";
import { organizationMemberships, organizations, users, wallets } from "./db/schema";
import { normalizeEmail, normalizeUsername, type PlatformUserRecord } from "./repositories/users";
import type { PlatformRole, UserStatus } from "./types";

export interface ProvisionPlatformUserInput {
  username: string;
  displayName?: string;
  email?: string | null;
  passwordHash?: string | null;
  image?: string | null;
  emailVerifiedAt?: Date | null;
  platformRole?: PlatformRole;
  status?: UserStatus;
  legacyNewApiUserId?: number | null;
}

/**
 * Create a platform user with a personal wallet and default owner workspace.
 * Used by password registration and OAuth first-login provisioning.
 */
export async function provisionPlatformUser(
  database: PlatformDatabase,
  input: ProvisionPlatformUserInput,
): Promise<PlatformUserRecord> {
  const username = normalizeUsername(input.username);
  if (!username) throw new Error("A username is required.");

  return database.transaction(async (tx) => {
    const [createdUser] = await tx
      .insert(users)
      .values({
        username,
        displayName: input.displayName?.trim() || username,
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash ?? null,
        image: input.image ?? null,
        emailVerifiedAt: input.emailVerifiedAt ?? null,
        platformRole: input.platformRole ?? "user",
        status: input.status ?? "active",
        legacyNewApiUserId: input.legacyNewApiUserId ?? null,
      })
      .returning();
    if (!createdUser) throw new Error("账户创建未返回记录。");

    await tx.insert(wallets).values({ userId: createdUser.id });
    const [organization] = await tx
      .insert(organizations)
      .values({
        name: `${createdUser.displayName} 的工作区`,
        slug: `${username}-${createdUser.id.slice(0, 8)}`,
        createdByUserId: createdUser.id,
      })
      .returning();
    if (!organization) throw new Error("工作区创建未返回记录。");
    await tx.insert(organizationMemberships).values({
      organizationId: organization.id,
      userId: createdUser.id,
      role: "owner",
    });
    return createdUser;
  });
}
