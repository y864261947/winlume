import { and, eq, sql } from "drizzle-orm";
import type { PlatformDatabase } from "./db/client";
import { apiKeys, desktopSessions, organizationMemberships, organizations, users } from "./db/schema";
import { desktopUserIsValid } from "./desktop-auth";
import { ApiKeyRepository } from "./repositories/api-keys";
import { decryptSecret } from "../newapi/crypto";
import { workspaceGateway } from "../gateway/workspace";

export class DesktopModelSessionError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

/** Issue a short upstream lease for this device; never disclose a team's shared Studio key. */
export async function resolveDesktopModelSession(database: PlatformDatabase, tokenHash: string) {
  const result = await database.transaction(async tx => {
    try {
      // Serializes bootstrap and logout across application instances.
      const [session] = await tx.select().from(desktopSessions).where(eq(desktopSessions.tokenHash, tokenHash)).limit(1).for("update");
      const now = new Date();
      if (!session?.userId || session.expiresAt <= now) throw new DesktopModelSessionError("登录已失效，请重新登录。", 401);
      const [user] = await tx.select().from(users).where(eq(users.id, session.userId)).limit(1);
      if (!desktopUserIsValid(session, user ?? null, now)) throw new DesktopModelSessionError("账号状态已变化，请重新登录。", 401);
      if (!user.currentOrganizationId) throw new DesktopModelSessionError("请先在网页中选择工作区。", 403);
      const [membership] = await tx.select().from(organizationMemberships).where(and(eq(organizationMemberships.userId, user.id), eq(organizationMemberships.organizationId, user.currentOrganizationId))).limit(1);
      if (!membership) throw new DesktopModelSessionError("你已不属于当前工作区，请先在网页中切换工作区。", 403);
      const [organization] = await tx.select().from(organizations).where(eq(organizations.id, user.currentOrganizationId)).limit(1);
      if (!organization) throw new DesktopModelSessionError("工作区不可用。", 403);

      const configured = new URL(process.env.NEW_API_PUBLIC_URL || process.env.NEW_API_URL || "");
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(configured.hostname);
      if (configured.username || configured.password || configured.search || configured.hash || configured.pathname !== "/" ||
        (configured.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local && configured.protocol === "http:"))) throw new Error("Invalid model gateway origin");

      const keys = await tx.select().from(apiKeys).where(and(eq(apiKeys.userId, user.id), sql`${apiKeys.metadata}->>'desktopSessionId' = ${session.id}`));
      const repository = new ApiKeyRepository(tx);
      for (const key of keys) {
        if (key.organizationId !== organization.id && key.status !== "revoked") {
          const wasActive = key.status === "active";
          await repository.revoke(key.id);
          // A later switch back may mint a new lease; an administrator's revocation must remain final.
          if (wasActive) await tx.update(apiKeys).set({ metadata: { ...key.metadata, desktopWorkspaceSwitched: true } }).where(eq(apiKeys.id, key.id));
        }
      }
      const workspaceKeys = keys.filter(item => item.organizationId === organization.id && !item.metadata?.desktopWorkspaceSwitched);
      let key = workspaceKeys.find(item => item.status === "active") ?? workspaceKeys[0];
      if (key && key.status !== "active") throw new DesktopModelSessionError("此设备的模型 Key 已停用，请重新登录。", 403);
      const gateway = workspaceGateway(tx, organization.id);
      const leaseExpires = new Date(Math.min(session.expiresAt.getTime(), now.getTime() + 10 * 60_000));
      if (!key) {
        // Deterministic name recovers an upstream create whose response/local insert was lost.
        const name = `Desktop ${session.id}`;
        const existing = await gateway.findKey(name);
        if (existing !== null) await gateway.revokeKey(existing);
        const created = await repository.create({ userId: user.id, organizationId: organization.id, name, expiresAt: leaseExpires,
          metadata: { desktopSessionId: session.id } });
        key = created.record;
      } else {
        const tokenId = key.newApiTokenId;
        const upstream = (await gateway.listKeys()).find(item => item.id === tokenId);
        if (!upstream || ![1, 3].includes(upstream.status)) throw new DesktopModelSessionError("此设备的模型 Key 已停用，请重新登录。", 403);
        if (!key.newApiTokenId || !key.newApiKeyCiphertext) throw new Error("Incomplete desktop model key");
        if (!key.expiresAt || key.expiresAt.getTime() < now.getTime() + 2 * 60_000) {
          await gateway.updateKey(key.newApiTokenId, { name: key.name, allAvailableGroups: true, expiredTime: Math.floor(leaseExpires.getTime() / 1000) });
          // Only an automatically expired key may be enabled again, never an explicit disable.
          if (upstream.status === 3 && upstream.expired_time <= Math.floor(now.getTime() / 1000)) await gateway.setKeyEnabled(key.newApiTokenId, true);
          await tx.update(apiKeys).set({ expiresAt: leaseExpires, updatedAt: now }).where(eq(apiKeys.id, key.id));
          key = { ...key, expiresAt: leaseExpires };
        }
      }
      if (!key.newApiKeyCiphertext || !key.expiresAt) throw new Error("Incomplete desktop model lease");
      const apiKey = decryptSecret(key.newApiKeyCiphertext);
      const baseUrl = `${configured.origin}/v1`;
      const response = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new DesktopModelSessionError("模型目录暂不可用，请稍后刷新。", 502);
      const catalog = await response.json() as { data?: { id?: unknown; supported_endpoint_types?: unknown }[] };
      // This first release supports Chat Completions. Do not advertise native-only/media models as chat models.
      const models = [...new Set((Array.isArray(catalog.data) ? catalog.data : []).filter(item => typeof item?.id === "string" && item.id &&
        Array.isArray(item.supported_endpoint_types) && item.supported_endpoint_types.includes("openai")).map(item => item.id as string))]
        .sort((a, b) => a.localeCompare(b)).map(id => ({ id, name: id }));
      if (!models.length) throw new DesktopModelSessionError("当前工作区暂无可用的兼容文本模型。", 403);
      // Logout/user/workspace changes which raced the network work must not receive a fresh credential.
      const [latest] = await tx.select().from(users).where(eq(users.id, user.id)).limit(1);
      const [stillMember] = await tx.select().from(organizationMemberships).where(and(eq(organizationMemberships.userId, user.id), eq(organizationMemberships.organizationId, organization.id))).limit(1);
      if (!desktopUserIsValid(session, latest ?? null) || latest.currentOrganizationId !== organization.id || !stillMember) {
        await repository.revoke(key.id);
        throw new DesktopModelSessionError("工作区或账号状态已变化，请刷新后重试。", 403);
      }
      return { credential: { organizationId: organization.id, organizationName: organization.name, apiKey, baseUrl,
        expiresAt: key.expiresAt.toISOString(), models } };
    } catch (error) {
      // Keep completed key creation/revocation even if discovery fails afterwards.
      // All operations use this connection, avoiding pool starvation while holding the device lock.
      return { error };
    }
  });
  if ("error" in result) throw result.error;
  return result;
}

/** Expire identity first. Failed upstream revocation remains retryable via the same DELETE. */
export async function revokeDesktopModelSession(database: PlatformDatabase, tokenHash: string) {
  const keys = await database.transaction(async tx => {
    const [session] = await tx.select().from(desktopSessions).where(eq(desktopSessions.tokenHash, tokenHash)).limit(1).for("update");
    if (!session) return [];
    await tx.update(desktopSessions).set({ expiresAt: new Date(0) }).where(eq(desktopSessions.id, session.id));
    return tx.select().from(apiKeys).where(and(eq(apiKeys.userId, session.userId ?? "00000000-0000-0000-0000-000000000000"), sql`${apiKeys.metadata}->>'desktopSessionId' = ${session.id}`));
  });
  const repository = new ApiKeyRepository(database);
  for (const key of keys) if (key.status !== "revoked") await repository.revoke(key.id);
}
