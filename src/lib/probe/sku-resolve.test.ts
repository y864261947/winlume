import { describe, expect, it } from "vitest";
import { indexCatalog, looksLikeSkuId, resolveSku, rewriteRequestModel } from "./sku-resolve";
import type { Sku, SkuBinding, SkuCatalog } from "./sku-catalog";

const binding = (over: Partial<SkuBinding> = {}): SkuBinding => ({
  channel: "22codex",
  upstreamModel: "MiniMaxH3-720p",
  priority: 1,
  costs: [{ unit: "per_call", amount: 1.2 }],
  equivalenceConfirmed: true,
  ...over,
});

const h3 = (): Sku => ({
  id: "video.minimaxh3.720p",
  displayName: "视频·H3·720p·标准",
  modality: "video",
  family: "minimaxh3",
  options: { resolution: "720p", quality: "standard" },
  markup: 1.5,
  bindings: [
    binding({ upstreamModel: "MiniMaxH3-720p", upscale: true, costs: [{ unit: "per_call", amount: 1.2 }] }),
    binding({ upstreamModel: "MiniMaxH3-720p-sec", upscale: true, costs: [{ unit: "per_second", amount: 0.08 }] }),
    binding({ upstreamModel: "MiniMaxH3-720p-sec-nf", upscale: false, costs: [{ unit: "per_second", amount: 0.08 }] }),
  ],
});

const catalog = (skus: Sku[]): SkuCatalog => ({ version: "t", skus });
const idx = (skus: Sku[]) => indexCatalog(catalog(skus));

describe("duration decides the billing mode, not the customer", () => {
  it("picks the per-second model for a short clip", () => {
    const r = resolveSku(idx([h3()]), { sku: "video.minimaxh3.720p", seconds: 5, upscale: true });
    expect(r.ok && r.upstreamModel).toBe("MiniMaxH3-720p-sec");
    expect(r.ok && r.estimatedCost).toBeCloseTo(0.4, 10);
  });

  it("picks the per-call model past the crossover", () => {
    const r = resolveSku(idx([h3()]), { sku: "video.minimaxh3.720p", seconds: 30, upscale: true });
    expect(r.ok && r.upstreamModel).toBe("MiniMaxH3-720p");
    expect(r.ok && r.estimatedCost).toBeCloseTo(1.2, 10);
  });

  // `-nf` = 不超分, same price, so it is a flag rather than a product.
  it("selects the -nf variant when upscaling is declined", () => {
    const r = resolveSku(idx([h3()]), { sku: "video.minimaxh3.720p", seconds: 5, upscale: false });
    expect(r.ok && r.upstreamModel).toBe("MiniMaxH3-720p-sec-nf");
  });
});

describe("refuses rather than guesses", () => {
  it("rejects an unknown SKU", () => {
    const r = resolveSku(idx([h3()]), { sku: "video.nope" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("unknown_sku");
  });

  // Unconfirmed equivalence must never reach a paying request.
  it("refuses a SKU whose bindings are not confirmed equivalent", () => {
    const draft = h3();
    draft.bindings.forEach((b) => (b.equivalenceConfirmed = false));
    const r = resolveSku(idx([draft]), { sku: "video.minimaxh3.720p", seconds: 5 });
    expect(!r.ok && r.code).toBe("not_sellable");
  });

  // A caller mistake and a catalog gap need different error codes or you
  // debug the wrong thing.
  it("distinguishes a missing duration from a dead route", () => {
    const perSecondOnly = h3();
    perSecondOnly.bindings = [binding({ upstreamModel: "x-sec", costs: [{ unit: "per_second", amount: 0.08 }] })];
    const missing = resolveSku(idx([perSecondOnly]), { sku: "video.minimaxh3.720p" });
    expect(!missing.ok && missing.code).toBe("missing_duration");

    const noUpscaleOption = h3();
    noUpscaleOption.bindings = [binding({ upscale: true, costs: [{ unit: "per_call", amount: 1 }] })];
    const dead = resolveSku(idx([noUpscaleOption]), { sku: "video.minimaxh3.720p", upscale: false });
    expect(!dead.ok && dead.code).toBe("no_route");
  });
});

describe("worst case reflects new-api's own failover", () => {
  // We hand new-api one name; its RetryTimes may still move the request to
  // another channel serving that name. Margin must survive that.
  it("reports the dearest confirmed binding as worst case", () => {
    const sku: Sku = {
      ...h3(),
      id: "image.gpt-image-2-5",
      modality: "image",
      bindings: [
        binding({ channel: "yunfei", upstreamModel: "gpt-image-2.5", priority: 5, costs: [{ unit: "per_call", amount: 0.008 }] }),
        binding({ channel: "kacang", upstreamModel: "gpt-image-2.5", priority: 1, costs: [{ unit: "per_call", amount: 0.07 }] }),
      ],
    };
    const r = resolveSku(idx([sku]), { sku: "image.gpt-image-2-5" });
    expect(r.ok && r.estimatedCost).toBeCloseTo(0.008, 10);
    expect(r.ok && r.worstCaseCost).toBeCloseTo(0.07, 10);
    expect(r.ok && r.alternatives).toHaveLength(1);
  });
});

describe("request rewriting", () => {
  it("recognises SKU ids without mistaking upstream names for them", () => {
    expect(looksLikeSkuId("video.minimaxh3.720p")).toBe(true);
    expect(looksLikeSkuId("image.gpt-image-2-5")).toBe(true);
    expect(looksLikeSkuId("gpt-image-2.5")).toBe(false);
    expect(looksLikeSkuId("MiniMaxH3-720p")).toBe(false);
    expect(looksLikeSkuId("claude-opus-4-6")).toBe(false);
  });

  // Existing integrations send upstream names; the catalog is additive.
  it("passes a non-SKU request through untouched", () => {
    const body = { model: "gpt-image-2.5", prompt: "x" };
    const { body: out, resolution } = rewriteRequestModel(body, idx([h3()]));
    expect(out).toEqual(body);
    expect(resolution).toBeNull();
  });

  it("rewrites a SKU request to the upstream name", () => {
    const { body, resolution } = rewriteRequestModel(
      { model: "video.minimaxh3.720p", duration: 5, upscale: true },
      idx([h3()]),
    );
    expect(body.model).toBe("MiniMaxH3-720p-sec");
    expect(resolution?.ok).toBe(true);
  });

  // `upscale` is our concept; new-api would reject or ignore it.
  it("strips the upscale flag before forwarding", () => {
    const { body } = rewriteRequestModel(
      { model: "video.minimaxh3.720p", duration: 5, upscale: false },
      idx([h3()]),
    );
    expect(body).not.toHaveProperty("upscale");
    expect(body.model).toBe("MiniMaxH3-720p-sec-nf");
  });

  it("leaves the body unchanged when resolution fails", () => {
    const body = { model: "video.unknown-thing", duration: 5 };
    const { body: out, resolution } = rewriteRequestModel(body, idx([h3()]));
    expect(out).toEqual(body);
    expect(resolution?.ok).toBe(false);
  });

  it("accepts either duration or seconds as the clip length", () => {
    const a = rewriteRequestModel({ model: "video.minimaxh3.720p", seconds: 5 }, idx([h3()]));
    expect(a.body.model).toBe("MiniMaxH3-720p-sec");
    const b = rewriteRequestModel({ model: "video.minimaxh3.720p", duration: 30 }, idx([h3()]));
    expect(b.body.model).toBe("MiniMaxH3-720p");
  });
});
