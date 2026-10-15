import { describe, expect, it } from "vitest";
import {
  billingCrossover,
  cheapestCost,
  planRoute,
  skuCost,
  skuPrice,
  validateCatalog,
  worstCost,
  worstMargin,
  type Sku,
  type SkuBinding,
} from "./sku-catalog";

const binding = (over: Partial<SkuBinding> = {}): SkuBinding => ({
  channel: "22codex",
  upstreamModel: "MiniMaxH3-720p",
  priority: 1,
  costs: [{ unit: "per_call", amount: 1.2 }],
  equivalenceConfirmed: true,
  ...over,
});

const sku = (over: Partial<Sku> = {}): Sku => ({
  id: "video.minimaxh3.720p",
  displayName: "视频·H3·720p·标准",
  modality: "video",
  family: "minimaxh3",
  options: { resolution: "720p", quality: "standard" },
  bindings: [binding()],
  markup: 1.5,
  ...over,
});

describe("billing mode is chosen per request, not sold as a product", () => {
  // Upstream sells H3-720p at 1.2 per call and 0.08 per second. Which is
  // cheaper depends entirely on clip length, so the customer should not
  // have to pick.
  const dual = binding({
    costs: [
      { unit: "per_call", amount: 1.2 },
      { unit: "per_second", amount: 0.08 },
    ],
  });

  it("uses per-second for short clips", () => {
    expect(cheapestCost(dual, 5)).toEqual({ unit: "per_second", total: 0.4 });
  });

  it("uses per-call for long clips", () => {
    expect(cheapestCost(dual, 30)).toEqual({ unit: "per_call", total: 1.2 });
  });

  it("reports the crossover duration", () => {
    expect(billingCrossover(dual)).toBeCloseTo(15, 10);
  });

  // Quoting a per-second model without knowing the duration would mean
  // inventing a clip length and under-charging.
  it("refuses a per-second price when duration is unknown", () => {
    const perSecond = binding({ costs: [{ unit: "per_second", amount: 0.08 }] });
    expect(cheapestCost(perSecond, null)).toBeNull();
  });

  it("still prices a per-call model with no duration", () => {
    expect(cheapestCost(binding(), null)).toEqual({ unit: "per_call", total: 1.2 });
  });

  // Seedance-style token billing needs a token estimate this layer lacks.
  it("skips token billing rather than guessing a token count", () => {
    const tokens = binding({ costs: [{ unit: "token", amount: 45.5 }] });
    expect(cheapestCost(tokens, 10)).toBeNull();
  });
});

describe("routing", () => {
  it("excludes bindings a human has not confirmed as equivalent", () => {
    const s = sku({
      bindings: [binding({ equivalenceConfirmed: false, channel: "cheap", costs: [{ unit: "per_call", amount: 0.1 }] })],
    });
    expect(planRoute(s, null)).toHaveLength(0);
    expect(skuCost(s, null)).toBeNull();
  });

  // Priority encodes operational judgement (reliability, quality); a cheap
  // channel must not climb above a channel you deliberately preferred.
  it("orders by priority before cost", () => {
    const s = sku({
      bindings: [
        binding({ channel: "cheap", priority: 1, costs: [{ unit: "per_call", amount: 0.1 }] }),
        binding({ channel: "trusted", priority: 5, costs: [{ unit: "per_call", amount: 9 }] }),
      ],
    });
    expect(planRoute(s, null).map((r) => r.binding.channel)).toEqual(["trusted", "cheap"]);
  });

  it("breaks priority ties by cost", () => {
    const s = sku({
      bindings: [
        binding({ channel: "dear", priority: 3, costs: [{ unit: "per_call", amount: 5 }] }),
        binding({ channel: "cheap", priority: 3, costs: [{ unit: "per_call", amount: 1 }] }),
      ],
    });
    expect(planRoute(s, null).map((r) => r.binding.channel)).toEqual(["cheap", "dear"]);
  });

  // `-nf` (不超分) is a request flag on one product, not a separate SKU.
  it("selects the binding matching the requested upscale setting", () => {
    const s = sku({
      bindings: [
        binding({ upstreamModel: "MiniMaxH3-720p-sec", upscale: true, costs: [{ unit: "per_second", amount: 0.08 }] }),
        binding({ upstreamModel: "MiniMaxH3-720p-sec-nf", upscale: false, costs: [{ unit: "per_second", amount: 0.08 }] }),
      ],
    });
    expect(planRoute(s, 5, false).map((r) => r.binding.upstreamModel)).toEqual(["MiniMaxH3-720p-sec-nf"]);
    expect(planRoute(s, 5, true).map((r) => r.binding.upstreamModel)).toEqual(["MiniMaxH3-720p-sec"]);
    expect(planRoute(s, 5).map((r) => r.binding.upstreamModel)).toHaveLength(2);
  });
});

describe("margin under failover", () => {
  // Failover means any confirmed binding may serve the request, so margin
  // has to survive the dearest one.
  const s = sku({
    bindings: [
      binding({ channel: "yunfei", priority: 5, costs: [{ unit: "per_call", amount: 0.008 }] }),
      binding({ channel: "kacang", priority: 1, costs: [{ unit: "per_call", amount: 0.07 }] }),
    ],
    markup: 1.5,
  });

  it("prices off the route actually taken", () => {
    expect(skuCost(s, null)).toBeCloseTo(0.008, 10);
    expect(skuPrice(s, null)).toBeCloseTo(0.012, 10);
  });

  it("reports the dearest reachable cost", () => {
    expect(worstCost(s, null)).toBeCloseTo(0.07, 10);
  });

  // 0.012 charged against a 0.07 fallback is a catastrophic loss, and the
  // number must say so rather than reporting the nominal 33%.
  it("shows a deeply negative margin when failover is far dearer", () => {
    expect(worstMargin(s, null)!).toBeCloseTo((0.012 - 0.07) / 0.012, 6);
    expect(worstMargin(s, null)!).toBeLessThan(0);
  });

  it("returns null rather than zero when nothing is routable", () => {
    const dead = sku({ bindings: [binding({ equivalenceConfirmed: false })] });
    expect(worstMargin(dead, null)).toBeNull();
    expect(skuPrice(dead, null)).toBeNull();
  });
});

describe("catalog validation", () => {
  it("blocks a SKU with no confirmed binding", () => {
    const issues = validateCatalog({ version: "t", skus: [sku({ bindings: [binding({ equivalenceConfirmed: false })] })] });
    expect(issues.some((i) => i.severity === "error" && i.message.includes("无法对外售卖"))).toBe(true);
  });

  it("warns about a single point of failure", () => {
    const issues = validateCatalog({ version: "t", skus: [sku()] });
    expect(issues.some((i) => i.severity === "warn" && i.message.includes("无故障转移"))).toBe(true);
  });

  it("rejects a duplicate id", () => {
    const issues = validateCatalog({ version: "t", skus: [sku(), sku()] });
    expect(issues.some((i) => i.message.includes("重复"))).toBe(true);
  });

  it("rejects a markup that would sell at or below cost", () => {
    const issues = validateCatalog({ version: "t", skus: [sku({ markup: 1 })] });
    expect(issues.some((i) => i.message.includes("加价倍率"))).toBe(true);
  });

  it("rejects a malformed id", () => {
    const issues = validateCatalog({ version: "t", skus: [sku({ id: "NotAnId" })] });
    expect(issues.some((i) => i.message.includes("必须形如"))).toBe(true);
  });

  // Two models that really are interchangeable should not differ 8×; that
  // gap usually means they are not equivalent, or one upstream is broken.
  it("questions a wide cost gap between confirmed-equivalent channels", () => {
    const s = sku({
      bindings: [
        binding({ channel: "yunfei", costs: [{ unit: "per_call", amount: 0.008 }] }),
        binding({ channel: "kacang", costs: [{ unit: "per_call", amount: 0.07 }] }),
      ],
    });
    const issues = validateCatalog({ version: "t", skus: [s] });
    expect(issues.some((i) => i.message.includes("请复核它们是否真的能力等价"))).toBe(true);
  });

  it("flags a binding with no usable price", () => {
    const s = sku({ bindings: [binding({ costs: [{ unit: "per_call", amount: 0 }] })] });
    const issues = validateCatalog({ version: "t", skus: [s] });
    expect(issues.some((i) => i.message.includes("没有可用价格"))).toBe(true);
  });
});
