import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export class MissingEncryptionKeyError extends Error {
  constructor() {
    super("REIZO_TOKEN_ENCRYPTION_KEY is required to encrypt/decrypt new-api secrets.");
    this.name = "MissingEncryptionKeyError";
  }
}

function resolveKey(key?: string): string {
  const value = key ?? process.env.REIZO_TOKEN_ENCRYPTION_KEY;
  if (!value || !value.trim()) throw new MissingEncryptionKeyError();
  return value.trim();
}

function deriveKey(input: string): Buffer {
  if (/^[a-f0-9]{64}$/i.test(input)) return Buffer.from(input, "hex");
  try {
    const decoded = Buffer.from(input, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // fall through to KDF
  }
  return createHash("sha256").update(input, "utf8").digest();
}

/** AES-256-GCM encrypt. Output packs iv/tag/ciphertext into one base64url string. */
export function encryptSecret(plaintext: string, key?: string): string {
  const derivedKey = deriveKey(resolveKey(key));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(packed: string, key?: string): string {
  const derivedKey = deriveKey(resolveKey(key));
  const [ivPart, tagPart, ciphertextPart] = packed.split(".");
  if (!ivPart || !tagPart || !ciphertextPart) {
    throw new Error("Malformed encrypted secret: expected iv.tag.ciphertext");
  }
  const decipher = createDecipheriv("aes-256-gcm", derivedKey, Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
