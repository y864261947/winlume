import { describe, expect, it } from "vitest";
import {
  buildVideoBody,
  durationCheckPair,
  extractTaskId,
  inferVideoFamily,
  isLegalDuration,
  normalizeTaskStatus,
} from "./video";
import {
  grossMargin,
  marginVerdict,
  resolveCost,
  resolveMarkup,
  suggestedPrice,
  validateCostEntry,
  videoClipCost,
  type CostEntry,
} from "./cost-ledger";

describe("video family routing", () => {
  it("identifies each upstream family from the model id", () => {
    expect(inferVideoFamily("MiniMaxH3-720p-sec")).toBe("h3");
    expect(inferVideoFamily("minimax_h3")).toBe("h3");
    expect(inferVideoFamily("wan3.0-t2v")).toBe("wan");
    expect(inferVideoFamily("grok-imagine-video-1.5")).toBe("grok");
    expect(inferVideoFamily("veo-3.1-generate-preview-ref")).toBe("veo");
    expect(inferVideoFamily("some-unknown-video")).toBe("unknown");
  });
});

describe("family-specific request bodies", () => {
  // 小安's docs warn: 请求字段不要跨家族照搬. Sending the wrong field name yields
  // a rejection that is indistinguishable from "model unsupported".
  it("uses ratio for Wan and aspect_ratio for the others", () => {
    const wan = buildVideoBody({ model: "wan3.0-t2v", prompt: "x", seconds: 5 });
    expect(wan.ratio).toBe("16:9");
    expect(wan.aspect_ratio).toBeUndefined();

    const h3 = buildVideoBody({ model: "MiniMaxH3-720p", prompt: "x", seconds: 5 });
    expect(h3.aspect_ratio).toBe("16:9");
    expect(h3.ratio).toBeUndefined();
  });

  it("uses the right reference-image field per family", () => {
    const url = "https://cdn.example.com/a.png";
    expect(buildVideoBody({ model: "MiniMaxH3-720p", prompt: "x", seconds: 5, imageUrl: url }).images).toEqual([url]);
    expect(buildVideoBody({ model: "wan3.0-i2v", prompt: "x", seconds: 5, imageUrl: url }).media).toEqual([
      { type: "first_frame", url },
    ]);
    expect(buildVideoBody({ model: "grok-imagine-video", prompt: "x", seconds: 5, imageUrl: url }).image).toEqual({ url });
    expect(buildVideoBody({ model: "veo-3.1", prompt: "x", seconds: 5, imageUrl: url }).image_url).toBe(url);
  });

  it("omits reference fields entirely for text-to-video", () => {
    const body = buildVideoBody({ model: "MiniMaxH3-720p", prompt: "x", seconds: 5 });
    expect("images" in body).toBe(false);
  });
});

describe("duration legality per family", () => {
  it("enforces each provider's documented range", () => {
    expect(isLegalDuration("h3", 15)).toBe(true);
    expect(isLegalDuration("h3", 16)).toBe(false);
    expect(isLegalDuration("wan", 3)).toBe(true);
    expect(isLegalDuration("wan", 2)).toBe(false);
    expect(isLegalDuration("wan", 30)).toBe(true);
  });

  // 云飞 veo accepts only 4/6/8; 5 and 10 both fail upstream.
  it("treats veo durations as an enum, not a range", () => {
    expect(isLegalDuration("veo", 4)).toBe(true);
    expect(isLegalDuration("veo", 8)).toBe(true);
    expect(isLegalDuration("veo", 5)).toBe(false);
    expect(isLegalDuration("veo", 10)).toBe(false);
  });
});

describe("duration check pair selection", () => {
  it("prefers an exact double so the expected ratio is clean", () => {
    expect(durationCheckPair("h3")).toEqual({ short: 1, long: 2 });
    expect(durationCheckPair("wan")).toEqual({ short: 3, long: 6 });
  });
  // The old hardcoded 5/10 pair was illegal for veo and would have produced a
  // meaningless verdict from two failed requests.
  it("picks legal enum values for veo", () => {
    expect(durationCheckPair("veo")).toEqual({ short: 4, long: 8 });
  });
  it("never proposes an illegal duration", () => {
    for (const family of ["h3", "wan", "grok", "veo"] as const) {
      const pair = durationCheckPair(family);
      expect(pair).not.toBeNull();
      expect(isLegalDuration(family, pair!.short)).toBe(true);
      expect(isLegalDuration(family, pair!.long)).toBe(true);
      expect(pair!.long).toBeGreaterThan(pair!.short);
    }
  });
});

describe("async task handling", () => {
  it("reads the task id under any of the documented field names", () => {
    expect(extractTaskId({ task_id: "t1" })).toBe("t1");
    expect(extractTaskId({ id: "sora-2:task_01k" })).toBe("sora-2:task_01k");
    expect(extractTaskId({ data: { task_id: "nested" } })).toBe("nested");
    expect(extractTaskId({ status: "queued" })).toBeNull();
  });

  it("normalizes provider-specific status names", () => {
    expect(normalizeTaskStatus("submitted")).toBe("queued");
    expect(normalizeTaskStatus("processing")).toBe("in_progress");
    expect(normalizeTaskStatus("succeeded")).toBe("completed");
    expect(normalizeTaskStatus("cancelled")).toBe("failed");
    expect(normalizeTaskStatus("weird")).toBe("unknown");
  });
});

describe("cost entry validation", () => {
  const perSecond: CostEntry = {
    modelName: "veo-3.1",
    channel: "yunfei",
    unit: "per_second",
    unitCost: 0.4,
    currency: "USD",
    effectiveFrom: "2026-01-01",
  };

  it("accepts each billing unit with its required fields", () => {
    expect(() => validateCostEntry(perSecond)).not.toThrow();
    expect(() =>
      validateCostEntry({ ...perSecond, unit: "token", unitCost: undefined, inputCost: 1, outputCost: 5 }),
    ).not.toThrow();
  });

  it("rejects an entry missing the cost for its unit", () => {
    expect(() => validateCostEntry({ ...perSecond, unitCost: undefined })).toThrow();
    expect(() => validateCostEntry({ ...perSecond, unit: "token", unitCost: undefined })).toThrow();
  });

  // Without an effective date, a price change silently rewrites past margins.
  it("requires an effective date", () => {
    expect(() => validateCostEntry({ ...perSecond, effectiveFrom: "" })).toThrow();
    expect(() => validateCostEntry({ ...perSecond, effectiveFrom: "昨天" })).toThrow();
  });
});

describe("effective cost over time", () => {
  const entries: CostEntry[] = [
    { modelName: "veo-3.1", channel: "yunfei", unit: "per_second", unitCost: 0.5, currency: "USD", effectiveFrom: "2026-01-01" },
    { modelName: "veo-3.1", channel: "yunfei", unit: "per_second", unitCost: 0.4, currency: "USD", effectiveFrom: "2026-03-01" },
    { modelName: "veo-3.1", channel: "22codex", unit: "per_second", unitCost: 0.45, currency: "USD", effectiveFrom: "2026-01-01" },
  ];

  it("returns the newest price that has already taken effect", () => {
    expect(resolveCost(entries, "veo-3.1", "yunfei", new Date("2026-02-01"))?.unitCost).toBe(0.5);
    expect(resolveCost(entries, "veo-3.1", "yunfei", new Date("2026-06-01"))?.unitCost).toBe(0.4);
  });
  it("ignores a future-dated price change", () => {
    expect(resolveCost(entries, "veo-3.1", "yunfei", new Date("2026-01-15"))?.unitCost).toBe(0.5);
  });
  it("keeps channels separate for the same model", () => {
    expect(resolveCost(entries, "veo-3.1", "22codex", new Date("2026-06-01"))?.unitCost).toBe(0.45);
  });
  it("returns null before any price existed", () => {
    expect(resolveCost(entries, "veo-3.1", "yunfei", new Date("2025-01-01"))).toBeNull();
  });
});

describe("markup resolution", () => {
  const policy = {
    default: 1.5,
    byVendor: { google: 1.35, openai: 1.6 },
    byModel: { "veo-3.1": 1.25 },
  };
  it("applies model over vendor over default", () => {
    expect(resolveMarkup(policy, "veo-3.1", "google")).toBe(1.25);
    expect(resolveMarkup(policy, "veo-3.0", "google")).toBe(1.35);
    expect(resolveMarkup(policy, "unknown-model", "nobody")).toBe(1.5);
    expect(resolveMarkup(policy, "unknown-model")).toBe(1.5);
  });
  it("matches vendor keys case-insensitively", () => {
    expect(resolveMarkup(policy, "x", "Google")).toBe(1.35);
  });
});

describe("suggested price and margin", () => {
  const perSecond: CostEntry = {
    modelName: "veo-3.1", channel: "yunfei", unit: "per_second",
    unitCost: 0.4, currency: "USD", effectiveFrom: "2026-01-01",
  };

  it("multiplies cost by markup for unit-priced models", () => {
    expect(suggestedPrice(perSecond, 1.5)).toEqual({ unit: "per_second", unitPrice: 0.6000000000000001 });
  });

  it("scales a per-second cost by clip length", () => {
    expect(videoClipCost(perSecond, 10)).toBeCloseTo(4, 10);
    expect(videoClipCost({ ...perSecond, unit: "per_call", unitCost: 0.25 }, 10)).toBe(0.25);
  });

  it("computes margin from the actual selling price", () => {
    expect(grossMargin(0.4, 0.8)).toBeCloseTo(0.5, 10);
  });

  // A fake 100% margin on zero cost would hide a misconfigured ledger.
  it("returns null rather than a fake margin when cost is zero", () => {
    expect(grossMargin(0, 0.8)).toBeNull();
    expect(grossMargin(0.4, 0)).toBeNull();
  });

  it("flags selling at or below cost", () => {
    const losing = marginVerdict({ entry: perSecond, markup: 1.5, actualPrice: 0.35 });
    expect(losing.losingMoney).toBe(true);
    expect(losing.detail).toContain("亏损");

    const breakEven = marginVerdict({ entry: perSecond, markup: 1.5, actualPrice: 0.4 });
    expect(breakEven.losingMoney).toBe(true);

    const healthy = marginVerdict({ entry: perSecond, markup: 1.5, actualPrice: 0.6 });
    expect(healthy.losingMoney).toBe(false);
    expect(healthy.margin).toBeCloseTo(1 / 3, 6);
  });

  it("reports an unset price without pretending it is a loss", () => {
    const verdict = marginVerdict({ entry: perSecond, markup: 1.5, actualPrice: null });
    expect(verdict.losingMoney).toBe(false);
    expect(verdict.margin).toBeNull();
    expect(verdict.detail).toContain("尚未设置售价");
  });
});
