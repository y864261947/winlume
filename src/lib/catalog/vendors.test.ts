import { describe, expect, it } from "vitest";
import { inferVendorFromModel } from "./vendors";
import { modelPriceLines, modelTags, resolvePlazaVendor } from "./plaza-display";
import type { PlazaModel } from "@/lib/catalog";

describe("inferVendorFromModel", () => {
  it("maps common OpenAI family names", () => {
    expect(inferVendorFromModel("gpt-5.5").key).toBe("openai");
    expect(inferVendorFromModel("o3-mini").key).toBe("openai");
    expect(inferVendorFromModel("chatgpt-4o-latest").key).toBe("openai");
  });

  it("maps Anthropic, Google, xAI, Qwen, MiniMax", () => {
    expect(inferVendorFromModel("claude-3-5-haiku-20241022").key).toBe("anthropic");
    expect(inferVendorFromModel("gemini-2.0-flash").key).toBe("google");
    expect(inferVendorFromModel("grok-3-mini").key).toBe("xai");
    expect(inferVendorFromModel("qwen3.8-max").key).toBe("alibaba");
    expect(inferVendorFromModel("MiniMax-H3").key).toBe("minimax");
  });

  it("falls back to other for unknown models", () => {
    expect(inferVendorFromModel("banana2-S").key).toBe("other");
  });

  it("uses the canonical local logo when old responses only provide a vendor name", () => {
    const vendor = resolvePlazaVendor({
      model_name: "gpt-5.5",
      vendor_name: "OpenAI",
      vendor_logo: "https://legacy.example/openai.svg",
      quota_type: 0,
      model_price: 0,
      model_ratio: 1,
    });
    expect(vendor.key).toBe("openai");
    expect(vendor.logo).toBe("/vendors/openai.svg");
  });
});

describe("plaza-display", () => {
  const base: PlazaModel = {
    model_name: "gpt-5.5",
    quota_type: 0,
    model_price: 0,
    model_ratio: 2.5,
    completion_ratio: 6,
  };

  it("builds CNY price lines with model_ratio and group_ratio applied (no FX)", () => {
    // quota_per_unit=500000: 1e6 * 2.5 * 0.25 / 5e5 = 1.25 input
    // output × completion 6 = 7.5
    const lines = modelPriceLines({
      ...base,
      quota_per_unit: 500_000,
      group_ratio: 0.25,
      billing_group: "gpt-pro",
    });
    expect(lines.kind).toBe("ratio");
    if (lines.kind === "ratio") {
      expect(lines.input).toContain("¥1.25");
      expect(lines.input).toContain("/1M");
      expect(lines.output).toContain("¥7.5");
      expect(lines.output).toContain("/1M");
    }
  });

  it("marks min-among-groups list prices with 起", () => {
    const lines = modelPriceLines({
      ...base,
      quota_per_unit: 500_000,
      group_ratio: 0.08,
      group_ratio_is_min: true,
    });
    expect(lines.kind).toBe("ratio");
    if (lines.kind === "ratio") {
      expect(lines.input).toContain("起");
      expect(lines.output).toContain("起");
    }
  });

  it("tags language models by default", () => {
    const tags = modelTags(base).map((tag) => tag.label);
    expect(tags).toContain("语言大模型");
  });
});

