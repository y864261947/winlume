import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const API_KEY_PREFIX = "wl_";
const PREFIX_VISIBLE_BYTES = 6;

export interface GeneratedApiKey {
  plaintext: string;
  prefix: string;
  hash: string;
}

export function hashApiKey(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function verifyApiKeyHash(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashApiKey(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(32).toString("base64url");
  const plaintext = `${API_KEY_PREFIX}${secret}`;
  const prefix = `${API_KEY_PREFIX}${secret.slice(0, PREFIX_VISIBLE_BYTES)}`;
  return { plaintext, prefix, hash: hashApiKey(plaintext) };
}

export function getApiKeyPrefix(value: string): string | null {
  if (!value.startsWith(API_KEY_PREFIX) || value.length <= API_KEY_PREFIX.length + PREFIX_VISIBLE_BYTES) {
    return null;
  }
  return value.slice(0, API_KEY_PREFIX.length + PREFIX_VISIBLE_BYTES);
}
