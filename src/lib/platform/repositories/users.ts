import { and, eq, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { PlatformDatabase } from "../db/client";
import { users } from "../db/schema";
import type { PlatformRole, UserStatus } from "../types";

export type PlatformUserRecord = InferSelectModel<typeof users>;

export interface CreatePlatformUserInput {
  username: string;
  displayName?: string;
  email?: string | null;
  passwordHash?: string | null;
  platformRole?: PlatformRole;
  status?: UserStatus;
  legacyNewApiUserId?: number | null;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export class UserRepository {
  constructor(private readonly database: PlatformDatabase) {}

  async findById(id: string): Promise<PlatformUserRecord | null> {
    const [user] = await this.database.select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  }

  async findByUsername(username: string): Promise<PlatformUserRecord | null> {
    const normalized = normalizeUsername(username);
    if (!normalized) return null;
    const [user] = await this.database.select().from(users).where(eq(users.username, normalized)).limit(1);
    return user ?? null;
  }

  async findByEmail(email: string): Promise<PlatformUserRecord | null> {
    const normalized = normalizeEmail(email);
    if (!normalized) return null;
    const [user] = await this.database.select().from(users).where(eq(users.email, normalized)).limit(1);
    return user ?? null;
  }

  async create(input: CreatePlatformUserInput): Promise<PlatformUserRecord> {
    const username = normalizeUsername(input.username);
    if (!username) throw new Error("A username is required.");

    const [user] = await this.database
      .insert(users)
      .values({
        username,
        displayName: input.displayName?.trim() || username,
        email: normalizeEmail(input.email),
        passwordHash: input.passwordHash ?? null,
        platformRole: input.platformRole ?? "user",
        status: input.status ?? "active",
        legacyNewApiUserId: input.legacyNewApiUserId ?? null,
      })
      .returning();
    if (!user) throw new Error("Failed to create platform user.");
    return user;
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.database
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async replacePasswordHashAfterLogin(
    userId: string,
    previousHash: string,
    nextHash: string,
  ): Promise<boolean> {
    const updated = await this.database
      .update(users)
      .set({ passwordHash: nextHash, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.passwordHash, previousHash)))
      .returning({ id: users.id });
    return updated.length === 1;
  }

  async setPasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.database
      .update(users)
      .set({ passwordHash, authVersion: sql`${users.authVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async incrementAuthVersion(userId: string): Promise<void> {
    await this.database
      .update(users)
      .set({ authVersion: sql`${users.authVersion} + 1`, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }
}
