import { and, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { PlatformDatabase } from "../db/client";
import { authIdentities } from "../db/schema";

export type AuthIdentityRecord = InferSelectModel<typeof authIdentities>;

export const GOOGLE_AUTH_PROVIDER = "google";
export const GITHUB_AUTH_PROVIDER = "github";

export interface CreateAuthIdentityInput {
  userId: string;
  provider: string;
  providerAccountId: string;
  accessTokenCiphertext?: string | null;
  refreshTokenCiphertext?: string | null;
  expiresAt?: Date | null;
}

export class AuthIdentityRepository {
  constructor(private readonly database: PlatformDatabase) {}

  async findByProviderAccount(
    provider: string,
    providerAccountId: string,
  ): Promise<AuthIdentityRecord | null> {
    const normalizedProvider = provider.trim().toLowerCase();
    const normalizedAccountId = providerAccountId.trim();
    if (!normalizedProvider || !normalizedAccountId) return null;

    const [identity] = await this.database
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, normalizedProvider),
          eq(authIdentities.providerAccountId, normalizedAccountId),
        ),
      )
      .limit(1);
    return identity ?? null;
  }

  async findByUserAndProvider(userId: string, provider: string): Promise<AuthIdentityRecord | null> {
    const normalizedProvider = provider.trim().toLowerCase();
    if (!userId || !normalizedProvider) return null;
    const [identity] = await this.database
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.userId, userId),
          eq(authIdentities.provider, normalizedProvider),
        ),
      )
      .limit(1);
    return identity ?? null;
  }

  async create(input: CreateAuthIdentityInput): Promise<AuthIdentityRecord> {
    const provider = input.provider.trim().toLowerCase();
    const providerAccountId = input.providerAccountId.trim();
    if (!input.userId || !provider || !providerAccountId) {
      throw new Error("Auth identity requires userId, provider, and providerAccountId.");
    }

    const [identity] = await this.database
      .insert(authIdentities)
      .values({
        userId: input.userId,
        provider,
        providerAccountId,
        accessTokenCiphertext: input.accessTokenCiphertext ?? null,
        refreshTokenCiphertext: input.refreshTokenCiphertext ?? null,
        expiresAt: input.expiresAt ?? null,
      })
      .returning();
    if (!identity) throw new Error("Failed to create auth identity.");
    return identity;
  }
}
