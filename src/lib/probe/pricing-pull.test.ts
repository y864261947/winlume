import { describe, expect, it } from "vitest";
import {
  deriveCost,
  detectResolutionInversion,
  isAcceptable,
  toCostEntry,
  type PricingRow,
} from "./pricing-pull";

const derive = (row: PricingRow, groupRatio: Record<string, number> = {}, policy: "highest" | "lowest" = "highest") =>
  deriveCost({ row, channel: "test", groupRatio, policy });

describe("resolution inversion detection", () => {
  // 小安's grok-imagine-video-1.5 really ships this table; selling against it
  // at an assumed 0.12 cost would mean paying 0.9 for 720p.
  it("flags a higher resolution priced below a lower one", () => {
    const result = detectResolutionInversion({ "1080p": 0.12, "480p": 0.7, "720p": 0.9 });
    expect(result).not.toBeNull();
    expect(result!.ratio).toBeCloseTo(7.5, 5);
  });

  it("accepts a normal ascending table", () => {
    expect(detectResolutionInversion({ "480p": 0.07, "720p": 0.09, "1080p": 0.12 })).toBeNull();
  });

  it("handles k-suffixed tiers", () => {
    expect(detectResolutionInversion({ "2k": 0.09, "4k": 3.09 })).toBeNull();
    expect(detectResolutionInversion({ "2k": 3.0, "4k": 0.1 })).not.toBeNull();
  });

  it("tolerates small differences that are plausible pricing", () => {
    expect(detectResolutionInversion({ "480p": 0.1, "720p": 0.095 })).toBeNull();
  });

  it("ignores unparseable or zero entries", () => {
    expect(detectResolutionInversion({ auto: 5, "720p": 0.1 })).toBeNull();
    expect(detectResolutionInversion({})).toBeNull();
  });
});

describe("per-second video cost", () => {
  // -sec models are quota_type=0 with model_ratio=37.5; the real per-second
  // price lives in video_price, NOT in model_price.
  const row: PricingRow = {
    model_name: "MiniMaxH3-720p-sec",
    quota_type: 0,
    model_ratio: 37.5,
    completion_ratio: 1,
    enable_groups: ["自部署minimax h3"],
    video_price: { "720p": 0.08 },
  };

  it("reads the per-second cost from video_price, not model_ratio", () => {
    const result = derive(row, { "自部署minimax h3": 1 })!;
    expect(result.unit).toBe("per_second");
    expect(result.cost).toBeCloseTo(0.08, 10);
    expect(result.resolution).toBe("720p");
  });

  it("costs the most expensive resolution, since the customer chooses it", () => {
    const multi: PricingRow = { ...row, model_name: "grok-imagine-video", video_price: { "480p": 0.07, "720p": 0.09, "1080p": 0.12 } };
    const result = derive(multi, { "自部署minimax h3": 1 })!;
    expect(result.cost).toBeCloseTo(0.12, 10);
    expect(result.resolution).toBe("1080p");
  });

  it("blocks an inverted resolution table", () => {
    const bad: PricingRow = { ...row, model_name: "grok-imagine-video-1.5", video_price: { "1080p": 0.12, "480p": 0.7, "720p": 0.9 } };
    const result = derive(bad, { "自部署minimax h3": 1 })!;
    expect(isAcceptable(result)).toBe(false);
    expect(result.warnings.some((w) => w.code === "resolution_inversion" && w.severity === "block")).toBe(true);
  });

  it("blocks a -sec model that has no video_price to read", () => {
    const result = derive({ ...row, video_price: undefined })!;
    expect(isAcceptable(result)).toBe(false);
    expect(result.warnings.some((w) => w.code === "sec_without_video_price")).toBe(true);
  });
});

describe("group ratio expansion", () => {
  // 云飞's gpt-image-2: model_price is a BASE of 1; real cost is
  // 1 × group_ratio, spanning 0.008 to 0.15 across enabled groups.
  const row: PricingRow = {
    model_name: "gpt-image-2",
    quota_type: 1,
    model_price: 1,
    enable_groups: ["image2 1k", "image2-high"],
  };
  const groups = { "image2 1k": 0.008, "image2-high": 0.15 };

  it("multiplies the base price by the group ratio", () => {
    expect(derive(row, groups, "highest")!.cost).toBeCloseTo(0.15, 10);
    expect(derive(row, groups, "lowest")!.cost).toBeCloseTo(0.008, 10);
  });

  it("reports the full spread so the choice is visible", () => {
    const result = derive(row, groups, "highest")!;
    expect(result.minCost).toBeCloseTo(0.008, 10);
    expect(result.maxCost).toBeCloseTo(0.15, 10);
    expect(result.groupUsed).toBe("image2-high");
  });

  it("warns when groups disagree by more than 1.5x", () => {
    const result = derive(row, groups, "highest")!;
    expect(result.warnings.some((w) => w.code === "group_spread")).toBe(true);
    // A spread is a decision to surface, not a reason to refuse the number.
    expect(isAcceptable(result)).toBe(true);
  });

  it("does not warn when groups are close together", () => {
    const result = derive(row, { "image2 1k": 0.1, "image2-high": 0.12 }, "highest")!;
    expect(result.warnings.some((w) => w.code === "group_spread")).toBe(false);
  });

  it("falls back to ratio 1 when no group ratio is known", () => {
    const result = derive({ ...row, enable_groups: [] }, {})!;
    expect(result.cost).toBeCloseTo(1, 10);
    expect(result.groupUsed).toBeNull();
  });
});

describe("per-call and token billing", () => {
  it("prefers image_price over model_price when present", () => {
    const result = derive(
      { model_name: "gpt-image-2", quota_type: 1, model_price: 0.1, image_price: { "1k": 0.1, "4k": 0.3 } },
      {},
    )!;
    expect(result.unit).toBe("per_call");
    expect(result.cost).toBeCloseTo(0.3, 10);
    expect(result.resolution).toBe("4k");
  });

  it("derives token cost from model_ratio and completion_ratio", () => {
    const result = derive(
      { model_name: "gpt-5.6", quota_type: 0, model_ratio: 5, completion_ratio: 4 },
      {},
    )!;
    expect(result.unit).toBe("token");
    // input = 5 * 2 = 10 USD/1M; output = 10 * 4 = 40
    expect(result.cost).toBeCloseTo(40, 10);
  });

  it("blocks tiered_expr models, whose cost is not a single number", () => {
    const result = derive({
      model_name: "grok-4.5",
      quota_type: 0,
      model_ratio: 1,
      billing_mode: "tiered_expr",
      billing_expr: 'len < 200000 ? tier("standard", p * 2) : tier("long", p * 4)',
    }, {})!;
    expect(isAcceptable(result)).toBe(false);
    expect(result.warnings.some((w) => w.code === "tiered_expr")).toBe(true);
  });

  it("blocks a row with no usable price instead of inventing zero", () => {
    const result = derive({ model_name: "mystery", quota_type: 1, model_price: 0 }, {})!;
    expect(isAcceptable(result)).toBe(false);
    expect(result.warnings.some((w) => w.code === "missing_price")).toBe(true);
  });

  it("returns null for a row with no model name", () => {
    expect(derive({ quota_type: 1, model_price: 1 })).toBeNull();
  });
});

describe("explicit price-block schema (Kacang fork)", () => {
  // This upstream states prices directly instead of as ratios, in CNY, with
  // per-group blocks and time-of-use tiers. Treating it with the ratio parser
  // reported all 80 models as "no price found".
  const tokenRow: PricingRow = {
    model_name: "claude-sonnet-4-6",
    price: { currency: "CNY", unit: "1M_tokens", input: 0.24, output: 1.2 },
    group_prices: {
      CCMAX: { currency: "CNY", unit: "1M_tokens", input: 2.4, output: 12 },
      "Claude kiro高缓": { currency: "CNY", unit: "1M_tokens", input: 0.24, output: 1.2 },
      按次文本: { currency: "CNY", unit: "request", request: 0.055 },
    },
  };

  it("derives token cost from group_prices at CNY/USD parity", () => {
    const result = derive(tokenRow, {}, "highest")!;
    expect(result.unit).toBe("token");
    // 1 CNY = 1 USD by operator instruction, so the figure passes through.
    expect(result.cost).toBeCloseTo(12, 6);
    expect(result.inputCost).toBeCloseTo(2.4, 6);
  });

  it("does not raise an FX warning while the rate is parity", () => {
    expect(derive(tokenRow, {}, "highest")!.warnings.some((w) => w.code === "currency_converted")).toBe(false);
  });

  it("warns about FX only when a non-parity rate is supplied", () => {
    const result = deriveCost({ row: tokenRow, channel: "test", groupRatio: {}, policy: "highest", cnyPerUsd: 7.1 })!;
    expect(result.cost).toBeCloseTo(12 / 7.1, 6);
    expect(result.warnings.some((w) => w.code === "currency_converted")).toBe(true);
  });

  // Comparing 0.055 CNY/request against 12 CNY/1M-tokens produced a bogus
  // "218× spread" between quantities that are not the same kind of thing.
  it("excludes differently-united groups from the spread", () => {
    const result = derive(tokenRow, {}, "highest")!;
    expect(result.maxCost / result.minCost).toBeCloseTo(10, 6);
    expect(result.warnings.some((w) => w.message.includes("不可直接比较"))).toBe(true);
  });

  it('treats unit "image" as per-call billing', () => {
    const row: PricingRow = {
      model_name: "nano-banana-2",
      group_prices: {
        default: { currency: "CNY", unit: "image", request: 0.06 },
        稳定香蕉: { currency: "CNY", unit: "image", request: 0.12 },
      },
    };
    const result = derive(row, {}, "highest")!;
    expect(result.unit).toBe("per_call");
    expect(result.cost).toBeCloseTo(0.12, 6);
    expect(isAcceptable(result)).toBe(true);

  });

  // Peak pricing is a real rate you can be billed at, so costing at off-peak
  // would understate it.
  it("costs time-of-use tiers at the most expensive tier and says so", () => {
    const row: PricingRow = {
      model_name: "deepseek-v4.1-flash",
      pricing_badges: ["time_of_use"],
      group_prices: {
        二折国模: {
          currency: "CNY",
          unit: "1M_tokens",
          input: 0.2,
          output: 0.8,
          tiers: [
            { label: "Off-peak", input: 0.2, output: 0.8 },
            { label: "Peak", input: 0.4, output: 1.6 },
          ],
        },
      },
    };
    const result = derive(row, {}, "highest")!;
    expect(result.cost).toBeCloseTo(1.6, 6);
    const tier = result.warnings.find((w) => w.code === "tier_spread");
    expect(tier?.message).toContain("2.0×");
  });

  it("honours the lowest-group policy", () => {
    expect(derive(tokenRow, {}, "lowest")!.cost).toBeCloseTo(1.2, 6);
  });

  it("does not misread a ratio-schema row as a price-block row", () => {
    const result = derive(
      { model_name: "x", quota_type: 1, model_price: 0.1, enable_groups: [] },
      {},
    )!;
    expect(result.cost).toBeCloseTo(0.1, 10);
    expect(result.warnings.some((w) => w.code === "currency_converted")).toBe(false);
  });
});

describe("ledger entry conversion", () => {
  it("maps a per-second derivation onto unitCost", () => {
    const derivation = derive(
      { model_name: "x-sec", quota_type: 0, model_ratio: 37.5, video_price: { "720p": 0.08 } },
      {},
    )!;
    const entry = toCostEntry(derivation, { effectiveFrom: "2026-01-01" });
    expect(entry.unit).toBe("per_second");
    expect(entry.unitCost).toBeCloseTo(0.08, 10);
    expect(entry.note).toContain("video_price");
  });

  it("maps a token derivation onto input and output costs", () => {
    const derivation = derive({ model_name: "t", quota_type: 0, model_ratio: 5, completion_ratio: 4 }, {})!;
    const entry = toCostEntry(derivation, { effectiveFrom: "2026-01-01", inputCost: 10 });
    expect(entry.inputCost).toBe(10);
    expect(entry.outputCost).toBeCloseTo(40, 10);
  });
});
