import { describe, expect, it } from "vitest";
import {
  API_KEY_PREFIX,
  extractApiKey,
  extractInternalIdentity,
  formatApiKey,
  generateApiKey,
  hashApiKey,
  verifyApiKeyHash,
} from "./auth";

describe("gateway API key helpers", () => {
  it("extracts bearer and x-api-key credentials without accepting other authorization schemes", () => {
    expect(extractApiKey({ authorization: "Bearer wl_test_secret" })).toMatchObject({
      value: "wl_test_secret",
      source: "authorization",
    });
    expect(extractApiKey({ authorization: "Basic dXNlcjpwYXNz", "x-api-key": "wl_fallback" })).toMatchObject({
      value: "wl_fallback",
      source: "x-api-key",
    });
    expect(extractApiKey({ authorization: "Token wl_nope" })).toBeUndefined();
  });

  it("formats, hashes, and verifies keys without retaining the raw value", () => {
    const key = "wl_1234567890abcdef";
    const digest = hashApiKey(key);
    expect(formatApiKey(key)).toBe("wl_12345...cdef");
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyApiKeyHash(key, digest)).toBe(true);
    expect(verifyApiKeyHash("wl_wrong", digest)).toBe(false);
  });

  it("generates a platform-prefixed, high-entropy key", () => {
    const key = generateApiKey();
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(key).toMatch(/^wl_[A-Za-z0-9_-]{43}$/);
  });
});

describe("Studio internal identity", () => {
  it("requires the internal token and ignores browser-controlled New-Api-User", () => {
    const token = "internal-token";
    expect(
      extractInternalIdentity(
        { "x-winlume-internal-token": token, "x-winlume-internal-user-id": "authjs-user-42" },
        token,
      ),
    ).toEqual({ source: "studio-internal", userId: "authjs-user-42" });
    expect(extractInternalIdentity({ "new-api-user": "spoofed-user" }, token)).toBeUndefined();
    expect(
      extractInternalIdentity(
        { "x-winlume-internal-token": "wrong", "x-winlume-internal-user-id": "spoofed-user" },
        token,
      ),
    ).toBeUndefined();
  });
});
