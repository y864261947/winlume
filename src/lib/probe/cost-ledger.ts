/**
 * Model cost ledger: upstream cost, markup policy, and resulting margin.
 *
 * Costs are entered by hand because the three upstreams in use publish prices
 * on doc pages rather than through an API. The ledger is therefore the single
 * place where "what this actually costs me" lives; everything downstream
 * (suggested price, gross margin, loss warnings) is derived from it.
 *
 * Pure module — no I/O, so every rule here is unit-testable.
 */

/** Billing units observed across the three upstreams. */
export type CostUnit =
  /** USD per 1M input / output tokens. */
  | "token"
  /** USD per single call, regardless of output size. */
  | "per_call"
  /** USD per second of generated video. */
  | "per_second";

export type CostEntry = {
  modelName: string;
  /** Upstream channel this cost belongs to; the same model may differ per channel. */
  channel: string;
  unit: CostUnit;
  /** token unit: USD per 1M input tokens. */
  inputCost?: number;
  /** token unit: USD per 1M output tokens. */
  outputCost?: number;
  /** per_call / per_second unit: USD per call or per second. */
  unitCost?: number;
  currency: "USD" | "CNY";
  /**
   * When this price took effect. Required: upstreams change prices, and
   * without it historical margin cannot be explained or recomputed.
   */
  effectiveFrom: string;
  note?: string;
};

export type MarkupPolicy = {
  /** Fallback multiplier when nothing more specific matches. */
  default: number;
  /** Per-vendor override, keyed by vendor key (lowercase). */
  byVendor?: Record<string, number>;
  /** Per-model override; highest precedence. */
  byModel?: Record<string, number>;
};

export const DEFAULT_MARKUP_POLICY: MarkupPolicy = { default: 1.5 };

export class CostLedgerError extends Error {}

function assertFinitePositive(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new CostLedgerError(`${field} 必须是非负有限数字。`);
  }
  return value;
}

/** Validate one entry before it is trusted by any pricing calculation. */
export function validateCostEntry(entry: CostEntry): CostEntry {
  if (!entry.modelName?.trim()) throw new CostLedgerError("modelName 不能为空。");
  if (!entry.channel?.trim()) throw new CostLedgerError("channel 不能为空。");
  if (!/^\d{4}-\d{2}-\d{2}/.test(entry.effectiveFrom ?? "")) {
    throw new CostLedgerError("effectiveFrom 必须是 ISO 日期（YYYY-MM-DD）。");
  }
  if (entry.unit === "token") {
    assertFinitePositive(entry.inputCost, "inputCost");
    assertFinitePositive(entry.outputCost, "outputCost");
  } else if (entry.unit === "per_call" || entry.unit === "per_second") {
    assertFinitePositive(entry.unitCost, "unitCost");
  } else {
    throw new CostLedgerError(`未知计价单位：${String(entry.unit)}`);
  }
  return entry;
}

/**
 * Resolve the effective cost for a model on a channel at a given time.
 *
 * Returns the newest entry whose effectiveFrom is not in the future, so a
 * scheduled price change does not retroactively alter today's margin.
 */
export function resolveCost(
  entries: CostEntry[],
  modelName: string,
  channel: string,
  at: Date = new Date(),
): CostEntry | null {
  const applicable = entries
    .filter(
      (entry) =>
        entry.modelName === modelName &&
        entry.channel === channel &&
        new Date(entry.effectiveFrom).getTime() <= at.getTime(),
    )
    .sort(
      (a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime(),
    );
  return applicable[0] ?? null;
}

/** Markup precedence: byModel > byVendor > default. */
export function resolveMarkup(
  policy: MarkupPolicy,
  modelName: string,
  vendorKey?: string,
): number {
  const byModel = policy.byModel?.[modelName];
  if (typeof byModel === "number" && Number.isFinite(byModel) && byModel > 0) return byModel;
  const key = vendorKey?.trim().toLowerCase();
  const byVendor = key ? policy.byVendor?.[key] : undefined;
  if (typeof byVendor === "number" && Number.isFinite(byVendor) && byVendor > 0) return byVendor;
  return policy.default;
}

export type SuggestedPrice =
  | { unit: "token"; input: number; output: number }
  | { unit: "per_call" | "per_second"; unitPrice: number };

export function suggestedPrice(entry: CostEntry, markup: number): SuggestedPrice {
  if (!Number.isFinite(markup) || markup <= 0) {
    throw new CostLedgerError("加价倍率必须是正数。");
  }
  if (entry.unit === "token") {
    return {
      unit: "token",
      input: (entry.inputCost ?? 0) * markup,
      output: (entry.outputCost ?? 0) * markup,
    };
  }
  return { unit: entry.unit, unitPrice: (entry.unitCost ?? 0) * markup };
}

/**
 * Apply one markup to every component of a text model's price.
 *
 * Input, output and cached-input are scaled by the SAME multiplier, which
 * preserves the upstream's own cache discount rather than imposing one.
 * Measured cache/input ratios across a single upstream range from 0.02 to
 * 0.29, so recomputing the cache price from an assumed discount would
 * misprice most models.
 */
export function scaleTextPrice(
  cost: { input: number | null; output: number | null; cache: number | null },
  markup: number,
): { input: number | null; output: number | null; cache: number | null } {
  const scale = (value: number | null): number | null =>
    value === null || !Number.isFinite(value) ? null : value * markup;
  return { input: scale(cost.input), output: scale(cost.output), cache: scale(cost.cache) };
}

/**
 * Gross margin against the price actually charged, not the suggested one.
 *
 * Returns null when cost is zero (margin is undefined, not 100%) — reporting
 * a fake 100% on a free upstream would hide a real configuration mistake.
 * A negative result means the model is sold below cost.
 */
export function grossMargin(cost: number, actualPrice: number): number | null {
  if (!Number.isFinite(cost) || !Number.isFinite(actualPrice)) return null;
  if (actualPrice <= 0) return null;
  if (cost <= 0) return null;
  return (actualPrice - cost) / actualPrice;
}

/** Cost of one video clip under per-second billing. */
export function videoClipCost(entry: CostEntry, seconds: number): number {
  if (entry.unit === "per_second") return (entry.unitCost ?? 0) * seconds;
  if (entry.unit === "per_call") return entry.unitCost ?? 0;
  throw new CostLedgerError(`模型 ${entry.modelName} 不是按秒或按次计价，无法计算单条视频成本。`);
}

export type MarginVerdict = {
  modelName: string;
  channel: string;
  unit: CostUnit;
  cost: number;
  suggested: number;
  actual: number | null;
  margin: number | null;
  /** True when the model is sold at or below cost — must be surfaced loudly. */
  losingMoney: boolean;
  detail: string;
};

/**
 * Compare cost against the price currently charged.
 *
 * For token models the comparison uses output price, which dominates real
 * spend on chat workloads; input is reported separately by the caller.
 */
export function marginVerdict(input: {
  entry: CostEntry;
  markup: number;
  /** Current selling price in the same unit as the entry; null when unknown. */
  actualPrice: number | null;
}): MarginVerdict {
  const { entry, markup, actualPrice } = input;
  const cost = entry.unit === "token" ? (entry.outputCost ?? 0) : (entry.unitCost ?? 0);
  const suggestion = suggestedPrice(entry, markup);
  const suggested = suggestion.unit === "token" ? suggestion.output : suggestion.unitPrice;
  const margin = actualPrice === null ? null : grossMargin(cost, actualPrice);
  const losingMoney = actualPrice !== null && actualPrice <= cost;

  const unitLabel = entry.unit === "token" ? "/1M tokens" : entry.unit === "per_second" ? "/秒" : "/次";
  const detail =
    actualPrice === null
      ? `尚未设置售价。建议 ${suggested.toFixed(6)} ${unitLabel}（成本 ${cost.toFixed(6)} × ${markup}）。`
      : losingMoney
        ? `🚨 售价 ${actualPrice.toFixed(6)} ${unitLabel} 未高于成本 ${cost.toFixed(6)}，每次调用都在亏损。`
        : `毛利率 ${((margin ?? 0) * 100).toFixed(1)}%（售价 ${actualPrice.toFixed(6)} / 成本 ${cost.toFixed(6)} ${unitLabel}）。`;

  return {
    modelName: entry.modelName,
    channel: entry.channel,
    unit: entry.unit,
    cost,
    suggested,
    actual: actualPrice,
    margin,
    losingMoney,
    detail,
  };
}
