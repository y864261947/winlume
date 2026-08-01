import { describe, expect, it } from "vitest";
import { generateApiKey, getApiKeyPrefix, hashApiKey, verifyApiKeyHash } from "./api-keys";

describe("API key secrets", () => {
  it("stores a deterministic hash and verifies it without retaining plaintext", () => {
    const hash = hashApiKey("wl_test_secret");
    expect(hash).toHaveLength(64);
    expect(verifyApiKeyHash("wl_test_secret", hash)).toBe(true);
    expect(verifyApiKeyHash("wl_test_secret_changed", hash)).toBe(false);
  });

  it("generates a high-entropy key with a separately displayable prefix", () => {
    const key = generateApiKey();
    expect(key.plaintext).toMatch(/^wl_[A-Za-z0-9_-]{40,}$/);
    expect(key.prefix).toMatch(/^wl_[A-Za-z0-9_-]{6}$/);
    expect(key.hash).toBe(hashApiKey(key.plaintext));
    expect(getApiKeyPrefix(key.plaintext)).toBe(key.prefix);
    expect(getApiKeyPrefix("not-a-key")).toBeNull();
  });
});
