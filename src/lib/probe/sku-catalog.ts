/**
 * Product catalog: your own SKUs, decoupled from upstream model names.
 *
 * The problem this solves is commercial, not cosmetic. Three upstreams sell
 * `gpt-image-2.5` at 0.008, 0.0168 and 0.07 — an 8.75× spread. If a customer
 * buys "gpt-image-2.5" by name, you are locked to whichever channel they
 * think they bought; if they buy YOUR sku "image.gpt.standard", routing is
 * your decision and the spread becomes margin.
 *
 * Three ideas carry the model:
 *
 *   1. A Sku is a capability you sell. It names a model FAMILY plus the
 *      dimensions a customer actually cares about (resolution, quality),
 *      never the upstream's internal variant spelling.
 *
 *   2. Billing mode is NOT a dimension. Upstream sells H3-720p both per-call
 *      (1.2) and per-second (0.08/s); which is cheaper depends on clip
 *      length, so it is a routing decision made per request, not a product
 *      the customer has to understand.
 *
 *   3. A Binding maps one Sku to one upstream model on one channel, with a
 *      priority. Failover walks the list in order. Equivalence is asserted by
 *      a human — the tool proposes candidates, it never auto-merges, because
 *      an upstream misconfiguration (grok-imagine-video-1.5's inverted
 *      resolution prices) would otherwise silently poison a tier.
 *
 * Pure module: no I/O, no clock. Cost inputs are passed in.
 */

import type { CostUnit } from "./cost-ledger";

/** Modalities this catalog covers. Text is deliberately out of scope. */
export type SkuModality = "image" | "video";

/**
 * Customer-visible quality tier.
 *
 * Kept deliberately small. The upstreams expose `fast`/`lite`/`quality`/
 * `pro`/`high`/`prime`/`mini` with no consistent meaning across vendors;
 * collapsing them to three tiers is the whole point of the abstraction.
 */
export type QualityTier = "draft" | "standard" | "premium";

export const QUALITY_LABEL: Record<QualityTier, string> = {
  draft: "快速",
  standard: "标准",
  premium: "高品质",
};

/**
 * Dimensions a customer selects. Every field is optional because different
 * families expose different axes — an image family has no duration.
 */
export type SkuOptions = {
  /** Normalized resolution token, e.g. "480p" | "720p" | "1080p" | "2k" | "4k". */
  resolution?: string;
  quality?: QualityTier;
  /**
   * Upscaling. MiniMaxH3's `-nf` suffix means "no upscale" (不超分) and is a
   * picture-quality axis, not a billing one — which is why `-sec` and
   * `-sec-nf` carry the same per-second price.
   */
  upscale?: boolean;
};

/** How an upstream model charges, and what it costs. */
export type BindingCost = {
  unit: CostUnit;
  /** USD per call, per second, or per 1M output tokens depending on unit. */
  amount: number;
};

/**
 * One upstream model, on one channel, that can serve a Sku.
 *
 * `equivalenceConfirmed` records that a human agreed this binding really is
 * interchangeable with the others. Unconfirmed bindings are visible in the
 * catalog but excluded from routing.
 */
export type SkuBinding = {
  channel: string;
  upstreamModel: string;
  /** Higher runs first. Ties break by cost. */
  priority: number;
  costs: BindingCost[];
  equivalenceConfirmed: boolean;
  /**
   * Whether this upstream name is the upscaled variant. MiniMaxH3 ships
   * `-nf` (不超分) at the same price, so both serve one Sku and the caller's
   * `upscale` option selects between them.
   */
  upscale?: boolean;
  note?: string;
};


export type Sku = {
  /** Stable machine id, e.g. "video.h3.720p". Never renamed once sold. */
  id: string;
  /** Customer-facing name. */
  displayName: string;
  modality: SkuModality;
  /** Upstream family this groups, for humans reading the catalog. */
  family: string;
  options: SkuOptions;
  bindings: SkuBinding[];
  /** Markup multiplier applied to resolved cost. */
  markup: number;
};

export type SkuCatalog = {
  version: string;
  skus: Sku[];
};

export class SkuCatalogError extends Error {}

/**
 * Pick the cheapest way to buy `seconds` of output from one binding.
 *
 * This is the crux of merging per-call and per-second into one Sku. For
 * H3-720p, per-call is 1.2 and per-second is 0.08: a 5-second clip costs
 * 0.40 per-second versus 1.2 per-call, while a 20-second clip costs 1.60
 * per-second versus 1.2 per-call. The crossover is real money, and the
 * customer should never have to think about it.
 *
 * Returns null when the binding cannot serve this request at all.
 */
export function cheapestCost(
  binding: SkuBinding,
  seconds: number | null,
): { unit: CostUnit; total: number } | null {
  let best: { unit: CostUnit; total: number } | null = null;
  for (const cost of binding.costs) {
    if (!Number.isFinite(cost.amount) || cost.amount <= 0) continue;
    let total: number;
    if (cost.unit === "per_call") {
      total = cost.amount;
    } else if (cost.unit === "per_second") {
      // A per-second price is unusable without a duration; refusing is
      // better than assuming a default clip length and under-quoting.
      if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) continue;
      total = cost.amount * seconds;
    } else {
      // Token billing for image/video (Seedance) needs a token estimate the
      // catalog does not have. Excluded rather than guessed.
      continue;
    }
    if (best === null || total < best.total) best = { unit: cost.unit, total };
  }
  return best;
}

export type RouteStep = {
  binding: SkuBinding;
  cost: { unit: CostUnit; total: number };
};

/**
 * Ordered failover plan for one request.
 *
 * Order is priority first (your operational judgement about reliability),
 * cost second. Cost never overrides priority: a channel you demoted because
 * it returns broken frames should not climb back up merely by being cheap.
 *
 * `wantUpscale` filters bindings that explicitly declare an upscale setting;
 * bindings that declare none serve either request.
 */
export function planRoute(
  sku: Sku,
  seconds: number | null,
  wantUpscale?: boolean,
): RouteStep[] {
  const steps: RouteStep[] = [];
  for (const binding of sku.bindings) {
    if (!binding.equivalenceConfirmed) continue;
    if (
      wantUpscale !== undefined &&
      binding.upscale !== undefined &&
      binding.upscale !== wantUpscale
    ) {
      continue;
    }
    const cost = cheapestCost(binding, seconds);
    if (cost === null) continue;
    steps.push({ binding, cost });
  }
  steps.sort((a, b) => {
    if (b.binding.priority !== a.binding.priority) return b.binding.priority - a.binding.priority;
    return a.cost.total - b.cost.total;
  });
  return steps;
}

/** Cost of the route actually taken, i.e. the first step that would run. */
export function skuCost(sku: Sku, seconds: number | null): number | null {
  const route = planRoute(sku, seconds);
  return route.length > 0 ? route[0].cost.total : null;
}

/**
 * Worst cost across confirmed bindings.
 *
 * Failover means you may end up on any of them, so margin has to survive the
 * most expensive one — the same reasoning the HTML report applies to group
 * spread.
 */
export function worstCost(sku: Sku, seconds: number | null): number | null {
  const route = planRoute(sku, seconds);
  if (route.length === 0) return null;
  return Math.max(...route.map((step) => step.cost.total));
}

export function skuPrice(sku: Sku, seconds: number | null): number | null {
  const cost = skuCost(sku, seconds);
  return cost === null ? null : cost * sku.markup;
}

/**
 * Margin if the request lands on the dearest confirmed binding.
 *
 * Null when it cannot be computed rather than zero, so a missing price never
 * reads as a free model.
 */
export function worstMargin(sku: Sku, seconds: number | null): number | null {
  const price = skuPrice(sku, seconds);
  const worst = worstCost(sku, seconds);
  if (price === null || worst === null || price <= 0) return null;
  return (price - worst) / price;
}

/** Validation findings, separated so a draft catalog can still be inspected. */
export type CatalogIssue = {
  skuId: string;
  severity: "error" | "warn";
  message: string;
};

export function validateCatalog(catalog: SkuCatalog): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const seen = new Set<string>();

  for (const sku of catalog.skus) {
    if (seen.has(sku.id)) {
      issues.push({ skuId: sku.id, severity: "error", message: `编目 id 重复：${sku.id}` });
    }
    seen.add(sku.id);

    if (!/^[a-z0-9]+(\.[a-z0-9-]+)+$/.test(sku.id)) {
      issues.push({ skuId: sku.id, severity: "error", message: `编目 id 必须形如 video.h3.720p：${sku.id}` });
    }
    if (!(sku.markup > 1)) {
      issues.push({ skuId: sku.id, severity: "error", message: `加价倍率必须 > 1，当前 ${sku.markup}` });
    }

    const confirmed = sku.bindings.filter((b) => b.equivalenceConfirmed);
    if (confirmed.length === 0) {
      issues.push({
        skuId: sku.id,
        severity: "error",
        message: "没有任何已确认等价的绑定，该编目无法对外售卖。",
      });
    } else if (confirmed.length === 1) {
      issues.push({
        skuId: sku.id,
        severity: "warn",
        message: `只有 1 个已确认渠道（${confirmed[0].channel}），无故障转移能力，该渠道挂了这个编目就断供。`,
      });
    }

    // A binding with no usable price is worse than a missing binding: it
    // looks routable in the catalog and fails at request time.
    for (const binding of sku.bindings) {
      const usable = binding.costs.filter((c) => c.amount > 0);
      if (usable.length === 0) {
        issues.push({
          skuId: sku.id,
          severity: "error",
          message: `绑定 ${binding.channel}/${binding.upstreamModel} 没有可用价格。`,
        });
      }
    }

    // Confirmed bindings whose cost differs wildly mean the "equivalent"
    // models probably are not, or one upstream is misconfigured.
    const perCall = confirmed
      .flatMap((b) => b.costs.filter((c) => c.unit === "per_call").map((c) => c.amount))
      .filter((a) => a > 0);
    const perSecond = confirmed
      .flatMap((b) => b.costs.filter((c) => c.unit === "per_second").map((c) => c.amount))
      .filter((a) => a > 0);
    for (const [label, values] of [["按次", perCall], ["按秒", perSecond]] as const) {
      if (values.length < 2) continue;
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      if (lo > 0 && hi / lo >= 3) {
        issues.push({
          skuId: sku.id,
          severity: "warn",
          message: `已确认等价的渠道间${label}成本相差 ${(hi / lo).toFixed(1)}×（${lo} ~ ${hi}）。请复核它们是否真的能力等价。`,
        });
      }
    }
  }

  return issues;
}

/**
 * Duration at which per-call becomes cheaper than per-second.
 *
 * Surfacing this lets you sanity-check a merged Sku: if the crossover sits
 * outside the durations customers actually request, one of the two billing
 * modes is dead weight.
 */
export function billingCrossover(binding: SkuBinding): number | null {
  const call = binding.costs.find((c) => c.unit === "per_call" && c.amount > 0);
  const sec = binding.costs.find((c) => c.unit === "per_second" && c.amount > 0);
  if (!call || !sec) return null;
  return call.amount / sec.amount;
}
