/**
 * Resolve a customer-facing SKU id into the upstream model name new-api
 * should receive.
 *
 * ## Why this layer exists at all
 *
 * new-api already routes and fails over — but only among channels serving
 * the SAME model name. `controller/relay.go` selects the next channel with
 * `CacheGetRandomSatisfiedChannel`, and reports failure as
 * "分组 %s 下模型 %s 的可用渠道不存在" keyed on `info.OriginModelName`.
 *
 * That leaves exactly two things new-api structurally cannot do, and they
 * are the two this module owns:
 *
 *   1. Cross-name equivalence. `MiniMaxH3-720p` failing over to a different
 *      vendor's 720p model is invisible to new-api: different names, no
 *      relationship.
 *   2. Duration-dependent billing choice. `MiniMaxH3-720p` (1.2/call) and
 *      `MiniMaxH3-720p-sec` (0.08/s) are two separate models to new-api; a
 *      static channel config cannot pick per request.
 *
 * Everything new-api DOES do well — same-name priority/weight selection,
 * RetryTimes failover, quota accounting — is deliberately left alone. This
 * module resolves a name and gets out of the way.
 */

import type { Sku, SkuCatalog } from "./sku-catalog";
import { planRoute } from "./sku-catalog";

/** What the caller asked for. */
export type SkuRequest = {
  /** Catalog id, e.g. "video.minimaxh3.720p". */
  sku: string;
  /** Clip length; required for any SKU whose cheapest route is per-second. */
  seconds?: number | null;
  /** MiniMaxH3 `-nf` means 不超分; default true (upscaled). */
  upscale?: boolean;
};

export type ResolutionOk = {
  ok: true;
  /** Name to send upstream. new-api takes over from here. */
  upstreamModel: string;
  /** The channel this cost estimate assumed — NOT a routing instruction. */
  expectedChannel: string;
  billingUnit: "per_call" | "per_second" | "token";
  estimatedCost: number;
  /** Cost if new-api's own failover lands on the dearest confirmed binding. */
  worstCaseCost: number;
  /** Ordered alternatives, for logging and diagnostics. */
  alternatives: Array<{ upstreamModel: string; channel: string; cost: number }>;
};

export type ResolutionError = {
  ok: false;
  code: "unknown_sku" | "not_sellable" | "missing_duration" | "no_route";
  message: string;
};

export type Resolution = ResolutionOk | ResolutionError;

/** Index a catalog for repeated lookups. */
export function indexCatalog(catalog: SkuCatalog): Map<string, Sku> {
  const index = new Map<string, Sku>();
  for (const sku of catalog.skus) index.set(sku.id, sku);
  return index;
}

/**
 * Resolve one request.
 *
 * Refuses rather than guesses in every ambiguous case. A wrong guess here
 * bills a real customer on a real channel, so "no_route" is always a better
 * answer than a plausible-looking default.
 */
export function resolveSku(index: Map<string, Sku>, request: SkuRequest): Resolution {
  const sku = index.get(request.sku);
  if (!sku) {
    return { ok: false, code: "unknown_sku", message: `未知编目：${request.sku}` };
  }

  const confirmed = sku.bindings.filter((binding) => binding.equivalenceConfirmed);
  if (confirmed.length === 0) {
    return {
      ok: false,
      code: "not_sellable",
      message: `编目 ${sku.id} 没有任何已确认等价的绑定，尚不可对外售卖。`,
    };
  }

  const seconds = request.seconds ?? null;
  const route = planRoute(sku, seconds, request.upscale);

  if (route.length === 0) {
    // Distinguish "you forgot the duration" from "nothing can serve this":
    // the first is a caller mistake with an obvious fix, the second is a
    // catalog problem. Collapsing them would send you hunting the wrong bug.
    const needsDuration =
      seconds === null &&
      confirmed.some((binding) =>
        binding.costs.every((cost) => cost.unit === "per_second"),
      );
    if (needsDuration) {
      return {
        ok: false,
        code: "missing_duration",
        message: `编目 ${sku.id} 按秒计价，必须提供 seconds 才能定价。`,
      };
    }
    return {
      ok: false,
      code: "no_route",
      message: `编目 ${sku.id} 当前没有可用路由（upscale=${request.upscale ?? "any"}）。`,
    };
  }

  const chosen = route[0];
  return {
    ok: true,
    upstreamModel: chosen.binding.upstreamModel,
    expectedChannel: chosen.binding.channel,
    billingUnit: chosen.cost.unit,
    estimatedCost: chosen.cost.total,
    worstCaseCost: Math.max(...route.map((step) => step.cost.total)),
    alternatives: route.slice(1).map((step) => ({
      upstreamModel: step.binding.upstreamModel,
      channel: step.binding.channel,
      cost: step.cost.total,
    })),
  };
}

/** A SKU id is namespaced with dots; upstream model names never are. */
export function looksLikeSkuId(model: string): boolean {
  return /^(image|video)\.[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(model);
}

/**
 * Rewrite the `model` field of an OpenAI-compatible request body.
 *
 * Returns the original body untouched when the model is not a SKU id, so
 * existing clients that send upstream names keep working unchanged — the
 * catalog is additive, not a breaking cutover.
 */
export function rewriteRequestModel(
  body: Record<string, unknown>,
  index: Map<string, Sku>,
): { body: Record<string, unknown>; resolution: Resolution | null } {
  const model = typeof body.model === "string" ? body.model : null;
  if (model === null || !looksLikeSkuId(model)) {
    return { body, resolution: null };
  }

  // Duration may arrive under either spelling depending on the video family.
  const seconds =
    typeof body.duration === "number"
      ? body.duration
      : typeof body.seconds === "number"
        ? body.seconds
        : null;
  const upscale = typeof body.upscale === "boolean" ? body.upscale : undefined;

  const resolution = resolveSku(index, { sku: model, seconds, upscale });
  if (!resolution.ok) return { body, resolution };

  // `upscale` is ours, not new-api's: it selected the `-nf` variant and must
  // not leak upstream as an unrecognized field.
  const next: Record<string, unknown> = { ...body, model: resolution.upstreamModel };
  delete next.upscale;
  return { body: next, resolution };
}
