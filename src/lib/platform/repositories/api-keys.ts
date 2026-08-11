import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { PlatformDatabase } from "../db/client";
import { apiKeys } from "../db/schema";
import { generateApiKey, hashApiKey } from "../api-keys";
import { decryptSecret, encryptSecret } from "../../newapi/crypto";
import { createTeamToken, fetchTeamTokenKey, findTeamTokenIdByName, revokeTeamToken } from "../../newapi/team-client";
import { TeamNewApiMappingRepository } from "./team-new-api-mapping";
import type { ApiKeyStatus } from "../types";

export type ApiKeyRecord = InferSelectModel<typeof apiKeys>;

export interface CreateApiKeyInput {
  userId: string;
  organizationId: string;
  name: string;
  scopes?: string[];
  allowedModels?: string[];
  allowedGroups?: string[];
  ipAllowlist?: string[];
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}

export class ApiKeyRepository {
  private readonly teamMappings = new TeamNewApiMappingRepository(this.database);

  constructor(private readonly database: PlatformDatabase) {}

  async create(input: CreateApiKeyInput): Promise<{ record: ApiKeyRecord; plaintext: string }> {
    const name = input.name.trim();
    if (!name) throw new Error("An API key name is required.");

    const mapping = await this.teamMappings.findByOrganizationId(input.organizationId);
    if (!mapping) throw new Error("This organization has no linked new-api team account.");
    const pat = decryptSecret(mapping.newApiPatCiphertext);

    await createTeamToken(pat, name);
    const newApiTokenId = await findTeamTokenIdByName(pat, name);
    if (newApiTokenId === null) throw new Error("new-api token was created but could not be found afterward.");
    const newApiKey = await fetchTeamTokenKey(pat, newApiTokenId);

    const generated = generateApiKey();
    const [record] = await this.database
      .insert(apiKeys)
      .values({
        userId: input.userId,
        organizationId: input.organizationId,
        name,
        keyPrefix: generated.prefix,
        keyHash: generated.hash,
        scopes: input.scopes ?? [],
        allowedModels: input.allowedModels ?? [],
        allowedGroups: input.allowedGroups ?? [],
        ipAllowlist: input.ipAllowlist ?? [],
        newApiTokenId,
        newApiKeyCiphertext: encryptSecret(newApiKey),
        expiresAt: input.expiresAt ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();
    if (!record) throw new Error("Failed to create API key.");
    return { record, plaintext: generated.plaintext };
  }

  async findById(id: string): Promise<ApiKeyRecord | null> {
    const [record] = await this.database.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    return record ?? null;
  }

  async findActiveByPlaintext(plaintext: string): Promise<ApiKeyRecord | null> {
    const keyHash = hashApiKey(plaintext);
    const [record] = await this.database
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.keyHash, keyHash),
          eq(apiKeys.status, "active"),
          or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, new Date())),
        ),
      )
      .limit(1);
    if (!record) return null;
    if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) return null;
    return record;
  }

  async listForUser(userId: string, organizationId?: string): Promise<ApiKeyRecord[]> {
    const conditions = [eq(apiKeys.userId, userId)];
    if (organizationId) conditions.push(eq(apiKeys.organizationId, organizationId));
    return this.database.select().from(apiKeys).where(and(...conditions));
  }

  /**
   * Returns every API key created by any member of the organization, not just
   * the caller's own keys. Use this for org-shared key visibility; `listForUser`
   * still scopes to a single user even when an organizationId is supplied.
   */
  async listForOrganization(organizationId: string): Promise<ApiKeyRecord[]> {
    return this.database.select().from(apiKeys).where(eq(apiKeys.organizationId, organizationId));
  }

  async setStatus(id: string, status: ApiKeyStatus): Promise<ApiKeyRecord | null> {
    const [record] = await this.database
      .update(apiKeys)
      .set({
        status,
        revokedAt: status === "revoked" ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(apiKeys.id, id))
      .returning();
    return record ?? null;
  }

  /** Marks the key revoked locally, then best-effort revokes the new-api token behind it —
   * a revoked local key stops working at the proxy regardless of new-api-side state, so a
   * failure here is logged, not thrown (design doc §5.3). */
  async revoke(id: string): Promise<ApiKeyRecord | null> {
    const record = await this.setStatus(id, "revoked");
    if (record?.newApiTokenId && record.organizationId) {
      const mapping = await this.teamMappings.findByOrganizationId(record.organizationId);
      if (mapping) {
        try {
          await revokeTeamToken(decryptSecret(mapping.newApiPatCiphertext), record.newApiTokenId);
        } catch (error) {
          console.error("Failed to revoke underlying new-api token", { keyId: id, error });
        }
      }
    }
    return record;
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.database.update(apiKeys).set({ lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(apiKeys.id, id));
  }
}
