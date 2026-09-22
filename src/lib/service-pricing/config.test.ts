import { describe, expect, it } from "vitest";
import { emptyPrice } from "./catalog";
import { updatePrice } from "./config";
const current = emptyPrice("groq-stt");
const input = { revision: 0, cost: "0.04", sale: "0.1", costCurrency: "USD", saleCurrency: "USD", notes: "" };
describe("service price drafts", () => {
  it("keeps decimal prices and increments revisions", () => {
    expect(updatePrice(current, input)).toMatchObject({ cost: "0.04", sale: "0.1", revision: 1 });
  });
  it("distinguishes an unset price from zero", () => {
    expect(updatePrice(current, { ...input, sale: null }).sale).toBeNull();
    expect(updatePrice(current, { ...input, sale: "0" }).sale).toBe("0");
  });
  it.each(["-1", "NaN", "Infinity", "1e3", "", "1000001", "0.0000001"])("rejects invalid amount %s", sale => {
    expect(() => updatePrice(current, { ...input, sale })).toThrow("有效价格");
  });
  it("rejects stale writes and attempts to activate billing", () => {
    expect(() => updatePrice({ ...current, revision: 1 }, input)).toThrow("其他操作");
    expect(() => updatePrice(current, { ...input, enabled: true })).toThrow("有效价格");
  });
});
