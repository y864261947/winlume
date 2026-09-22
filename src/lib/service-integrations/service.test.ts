import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyConfig, type StoredServiceConfig } from "./config";
const state = vi.hoisted(() => ({ record: null as StoredServiceConfig | null }));
vi.mock("./store", () => ({
  readService: async () => state.record,
  changeService: async (_id: string, change: (row: StoredServiceConfig) => StoredServiceConfig) => { state.record = change(state.record!); return state.record; },
}));
vi.mock("./adapters", () => ({ callProvider: vi.fn() }));
vi.mock("@/lib/newapi/crypto", () => ({ encryptSecret: (key: string) => `encrypted:${key}`, decryptSecret: () => "test-key" }));
import { callProvider } from "./adapters";
import { executeService, saveService, testService } from "./service";
beforeEach(() => { vi.clearAllMocks(); state.record = { ...emptyConfig("tavily"), keyCiphertext: "encrypted:key" }; });
describe("service orchestration", () => {
  it("blocks disabled production calls but allows administrator probes", async () => {
    await expect(executeService("tavily", "query")).rejects.toThrow("尚未启用");
    expect(callProvider).not.toHaveBeenCalled();
    vi.mocked(callProvider).mockResolvedValue({ content: "[]", contentType: "application/json", usage: "1 credits" });
    const result = await testService("tavily", 0);
    expect(result.result.ok).toBe(true);
    expect(result.service.enabled).toBe(false);
    expect(result.service.tests).toHaveLength(1);
    await expect(testService("tavily", 0)).rejects.toThrow("30 秒");
    expect(callProvider).toHaveBeenCalledTimes(1);
  });
  it("records a safe failure without exposing thrown secrets", async () => {
    vi.mocked(callProvider).mockRejectedValue(new Error("test-key"));
    const result = await testService("tavily", 0);
    expect(result.result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("test-key");
  });
  it("retains a concurrent edit and tags the result with the tested revision", async () => {
    vi.mocked(callProvider).mockImplementation(async () => {
      await saveService("tavily", { revision: 0, enabled: true, options: state.record!.options });
      return { content: "[]", contentType: "application/json", usage: null };
    });
    const result = await testService("tavily", 0);
    expect(result.service.revision).toBe(1);
    expect(result.service.enabled).toBe(true);
    expect(result.result.revision).toBe(0);
  });
});
