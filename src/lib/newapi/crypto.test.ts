import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, MissingEncryptionKeyError } from "./crypto";

const KEY_HEX = "a".repeat(64); // 32 bytes, valid hex key

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext secret", () => {
    const ciphertext = encryptSecret("sk-abc123", KEY_HEX);
    expect(ciphertext).not.toContain("sk-abc123");
    expect(decryptSecret(ciphertext, KEY_HEX)).toBe("sk-abc123");
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const a = encryptSecret("same-value", KEY_HEX);
    const b = encryptSecret("same-value", KEY_HEX);
    expect(a).not.toBe(b);
  });

  it("accepts a base64 32-byte key", () => {
    const base64Key = Buffer.alloc(32, 7).toString("base64");
    const ciphertext = encryptSecret("value", base64Key);
    expect(decryptSecret(ciphertext, base64Key)).toBe("value");
  });

  it("derives a key from an arbitrary passphrase", () => {
    const ciphertext = encryptSecret("value", "not-a-32-byte-key");
    expect(decryptSecret(ciphertext, "not-a-32-byte-key")).toBe("value");
  });

  it("fails decryption with the wrong key", () => {
    const ciphertext = encryptSecret("value", KEY_HEX);
    expect(() => decryptSecret(ciphertext, "b".repeat(64))).toThrow();
  });

  it("throws MissingEncryptionKeyError when no key is configured", () => {
    const original = process.env.REIZO_TOKEN_ENCRYPTION_KEY;
    delete process.env.REIZO_TOKEN_ENCRYPTION_KEY;
    try {
      expect(() => encryptSecret("value")).toThrow(MissingEncryptionKeyError);
    } finally {
      if (original !== undefined) process.env.REIZO_TOKEN_ENCRYPTION_KEY = original;
    }
  });
});
