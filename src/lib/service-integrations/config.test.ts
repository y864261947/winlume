import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SERVICE_OPTIONS } from "./catalog";
import { emptyConfig, publicConfig, serviceKey, updateConfig } from "./config";

beforeEach(() => vi.stubEnv("REIZO_TOKEN_ENCRYPTION_KEY", "integration-test-encryption-key"));
afterEach(() => vi.unstubAllEnvs());
const input = { revision: 0, enabled: true, apiKey: "test-secret-123", options: DEFAULT_SERVICE_OPTIONS };
describe("service credentials", () => {
  it("encrypts at rest and never includes secrets or ciphertext in public responses", () => {
    const saved = updateConfig(emptyConfig("tavily"), input);
    expect(saved.keyCiphertext).not.toContain(input.apiKey);
    expect(serviceKey(saved)).toBe(input.apiKey);
    const response = JSON.stringify(publicConfig(saved));
    expect(response).not.toContain(input.apiKey);
    expect(response).not.toContain(saved.keyCiphertext!);
    expect(publicConfig(saved).hasKey).toBe(true);
  });
  it("keeps a saved Key when the form is blank, and clears it only explicitly", () => {
    const saved = updateConfig(emptyConfig("tavily"), input);
    const preserved = updateConfig(saved, { ...input, revision: 1, apiKey: "", enabled: false });
    expect(serviceKey(preserved)).toBe(input.apiKey);
    const cleared = updateConfig(preserved, { ...input, revision: 2, apiKey: "", enabled: false, clearKey: true });
    expect(cleared.keyCiphertext).toBeNull();
    expect(publicConfig(cleared).hasKey).toBe(false);
  });
  it("rejects stale writes, missing credentials and malformed inputs", () => {
    expect(() => updateConfig(emptyConfig("tavily"), { ...input, revision: 1 })).toThrow("配置已被更新");
    expect(() => updateConfig(emptyConfig("tavily"), { ...input, apiKey: "" })).toThrow("请先保存");
    expect(() => updateConfig(emptyConfig("tavily"), { ...input, apiKey: "key\nheader" })).toThrow("配置格式");
    expect(() => updateConfig(emptyConfig("tavily"), { ...input, options: { ...DEFAULT_SERVICE_OPTIONS, voiceId: "../../admin" } })).toThrow("配置格式");
    expect(() => updateConfig(emptyConfig("tavily"), { ...input, baseUrl: "http://localhost" })).toThrow("配置格式");
  });
  it("fails closed when encryption is unavailable or the encryption key has changed", () => {
    const saved = updateConfig(emptyConfig("tavily"), input);
    vi.stubEnv("REIZO_TOKEN_ENCRYPTION_KEY", "different-encryption-key");
    expect(() => serviceKey(saved)).toThrow("无法解密");
    vi.stubEnv("REIZO_TOKEN_ENCRYPTION_KEY", "");
    expect(() => updateConfig(emptyConfig("tavily"), input)).toThrow("REIZO_TOKEN_ENCRYPTION_KEY");
  });
});
