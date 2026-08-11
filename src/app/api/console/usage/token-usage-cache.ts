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
