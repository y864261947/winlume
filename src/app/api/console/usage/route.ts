import {
  ConsoleRequestError,
  consoleError,
  consoleJson,
  ensureOrganizationKeyManager,
  requireConsoleContext,
} from "@/lib/console/server";
import { requireConsoleOrganization } from "@/lib/console/workspace";
import { decryptSecret } from "@/lib/newapi/crypto";
import { getNewApiUserQuota } from "@/lib/newapi/admin-client";
import { getTokenUsage } from "@/lib/newapi/team-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type TokenUsage = {
  totalGranted: number;
  totalUsed: number;
  totalAvailable: number;
};

export type ConsoleTokenUsageItem = {
  kind: "key" | "studio";
  apiKeyId: string;
  name: string;
  keyPrefix: string;
  newApiTokenId: number | null;
  totalGranted: number;
  totalUsed: number;
  totalAvailable: number;
};

/** Short-TTL cache so a console page load does not fan out N uncached new-api calls. */
const TOKEN_USAGE_TTL_MS = 30_000;
const tokenUsageCache = new Map<string, { expiresAt: number; value: TokenUsage }>();

/**
 * Returns cached token usage when still within the TTL window; otherwise runs
 * `fetcher` and stores the result. Keyed by new-api token id (stringified).
 */
export async function cachedTokenUsage(
  tokenId: number | string,
  fetcher: () => Promise<TokenUsage>,
): Promise<TokenUsage> {
  const key = String(tokenId);
  const now = Date.now();
  const hit = tokenUsageCache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }
  const value = await fetcher();
  tokenUsageCache.set(key, { expiresAt: now + TOKEN_USAGE_TTL_MS, value });
  return value;
}

/** Test helper — clears the module-level usage cache. */
export function clearTokenUsageCache(): void {
  tokenUsageCache.clear();
}

/**
 * Team-admin observability: team quota from new-api admin API, plus per-key
 * (and Studio-hidden) usage from each token's own sk (design §7).
 */
export async function GET(request: Request) {
  try {
    const context = await requireConsoleContext();
    const url = new URL(request.url);
    let organizationId = url.searchParams.get("organizationId");

    if (!organizationId) {
      const platformUser = await context.repositories.users.findById(context.userId);
      organizationId = platformUser?.currentOrganizationId ?? null;
    }
    if (!organizationId) {
      throw new ConsoleRequestError("请选择一个工作区。", 400, "organization_id_required");
    }

    const selected = await requireConsoleOrganization(context, organizationId);
    // Team admin view (design §7).
    ensureOrganizationKeyManager(selected.membership.role);

    const mapping = await context.repositories.teamNewApiMapping.findByOrganizationId(organizationId);
    if (!mapping) {
      throw new ConsoleRequestError("工作区未关联额度账户。", 409, "team_mapping_missing");
    }

    const { quota, usedQuota } = await getNewApiUserQuota(mapping.newApiUserId);
    const keyRecords = await context.repositories.apiKeys.listForOrganization(organizationId);

    const items: ConsoleTokenUsageItem[] = await Promise.all(
      keyRecords.map(async (record) => {
        const kind: "key" | "studio" = record.isStudioHidden ? "studio" : "key";
        const base = {
          kind,
          apiKeyId: record.id,
          name: record.name,
          keyPrefix: record.keyPrefix,
          newApiTokenId: record.newApiTokenId ?? null,
        };

        if (!record.newApiKeyCiphertext || record.newApiTokenId == null) {
          return {
            ...base,
            totalGranted: 0,
            totalUsed: 0,
            totalAvailable: 0,
          };
        }

        const usage = await cachedTokenUsage(record.newApiTokenId, () =>
          getTokenUsage(decryptSecret(record.newApiKeyCiphertext!)),
        );
        return {
          ...base,
          totalGranted: usage.totalGranted,
          totalUsed: usage.totalUsed,
          totalAvailable: usage.totalAvailable,
        };
      }),
    );

    // Studio as its own line item first, then user keys by usage desc.
    items.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "studio" ? -1 : 1;
      return right.totalUsed - left.totalUsed;
    });

    return consoleJson({
      organizationId,
      quota,
      used_quota: usedQuota,
      items,
    });
  } catch (error) {
    return consoleError(error);
  }
}
