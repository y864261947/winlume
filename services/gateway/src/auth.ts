import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { HeaderMap, GatewayIdentity } from "./types";

export const API_KEY_PREFIX = "wl_";
export const INTERNAL_TOKEN_HEADER = "x-winlume-internal-token";
export const INTERNAL_USER_ID_HEADER = "x-winlume-internal-user-id";
export const INTERNAL_IDENTITY_HEADER = "x-winlume-internal-identity";

const INTERNAL_USER_ALIASES = [
  INTERNAL_USER_ID_HEADER,
  INTERNAL_IDENTITY_HEADER,
  "x-winlume-internal-user",
  "x-winlume-user-id",
] as const;

export type ApiKeySource = "authorization" | "x-api-key";

export interface ExtractedApiKey {
  value: string;
  source: ApiKeySource;
  display: string;
}

export interface InternalIdentity {
  source: "studio-internal";
  userId?: string;
}

function headerValues(headers: HeaderMap | Headers): Array<[string, string]> {
  const values: Array<[string, string]> = [];
  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    headers.forEach((value, key) => values.push([key.toLowerCase(), value]));
    return values;
  }
  for (const [key, value] of Object.entries(headers as Record<string, string | string[] | undefined>)) {
    if (Array.isArray(value)) {
      for (const item of value) values.push([key.toLowerCase(), item]);
    } else if (typeof value === "string") {
      values.push([key.toLowerCase(), value]);
    }
  }
  return values;
}

export function getHeader(headers: HeaderMap | Headers, name: string): string | undefined {
  const needle = name.toLowerCase();
  const found = headerValues(headers).find(([key]) => key === needle);
  return found?.[1];
}

export function extractApiKey(headers: HeaderMap | Headers): ExtractedApiKey | undefined {
  const authorization = getHeader(headers, "authorization")?.trim();
  if (authorization) {
    const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
    if (match?.[1]) {
      const value = match[1];
      return { value, source: "authorization", display: formatApiKey(value) };
    }
  }

  const alternate = getHeader(headers, "x-api-key")?.trim() ?? getHeader(headers, "api-key")?.trim();
  if (alternate) {
    return { value: alternate, source: "x-api-key", display: formatApiKey(alternate) };
  }
  return undefined;
}

/** Return a stable, non-secret representation suitable for logs and UI. */
export function formatApiKey(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  if (normalized.length <= 8) return `${normalized.slice(0, 3)}...`;
  return `${normalized.slice(0, 8)}...${normalized.slice(-4)}`;
}

export function generateApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** SHA-256 is intentionally used only as a lookup digest; raw keys are never persisted. */
export function hashApiKey(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function verifyApiKeyHash(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashApiKey(value), "utf8");
  const expected = Buffer.from(expectedHash.trim().replace(/^sha256:/i, ""), "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function safeSecretEqual(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validIdentityValue(value: string): boolean {
  return value.length > 0 && value.length <= 256 && !/[\r\n]/.test(value);
}

/**
 * Resolve the Studio identity only when the separate internal token matches.
 * New-Api-User and x-winlume-user are deliberately not read here.
 */
export function extractInternalIdentity(
  headers: HeaderMap | Headers,
  configuredToken: string | undefined,
): InternalIdentity | undefined {
  if (!configuredToken) return undefined;
  const token = getHeader(headers, INTERNAL_TOKEN_HEADER)?.trim();
  if (!safeSecretEqual(configuredToken, token)) return undefined;
  const userId = INTERNAL_USER_ALIASES.map((name) => getHeader(headers, name)?.trim()).find(Boolean);
  if (userId && !validIdentityValue(userId)) return undefined;
  return { source: "studio-internal", ...(userId ? { userId } : {}) };
}

export function apiKeyIdentity(extracted: ExtractedApiKey): GatewayIdentity {
  return {
    source: "api-key",
    apiKeyDisplay: extracted.display,
    apiKeyHash: hashApiKey(extracted.value),
  };
}

export function internalIdentity(identity: InternalIdentity): GatewayIdentity {
  return { source: "studio-internal", ...(identity.userId ? { userId: identity.userId } : {}) };
}
