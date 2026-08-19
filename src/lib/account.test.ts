import { describe, expect, it } from "vitest";
import { formatBalance } from "./account";

describe("formatBalance", () => {
  it("converts legacy credits into the portal CNY display unit", () => {
    expect(formatBalance(12_500_000, {
      quota_per_unit: 1,
      quota_display_type: "custom",
      custom_currency_symbol: "credits",
    })).toBe("¥25");
  });

  it("keeps an explicitly configured CNY ratio", () => {
    expect(formatBalance(1_250_000, {
      quota_per_unit: 500_000,
      quota_display_type: "custom",
      custom_currency_symbol: "¥",
    })).toBe("¥2.5");
  });
});
