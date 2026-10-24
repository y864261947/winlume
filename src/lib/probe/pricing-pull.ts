/**
 * Derive upstream cost from a new-api `/api/pricing` payload.
 *
 * All three upstreams in use (云飞 img.yunfei.best, 卡藏 newapi.prompt-hubs.com,
 * 小安 app.22codex.xyz) run new-api and expose `/api/pricing` without auth, so
 * cost can be pulled instead of typed. The payload is not self-explanatory
 * though — three traps live here, each capable of understating real cost:
 *
 *  1. `model_price` is a BASE, not a price. Real cost is `model_price ×
 *     group_ratio`, and a model enabled in several groups has several costs.
 *     云飞's gpt-image-2 ranges from $0.008 (image2 1k) to $0.15 (image2-high)
 *     — an 18.75× spread behind one model name.
 *  2. Per-second video models are `quota_type=0` with `model_ratio=37.5`; the
 *     real per-second price lives in `video_price`, keyed by resolution.
 *  3. `video_price` values are upstream-authored and sometimes wrong (小安's
 *     grok-imagine-video-1.5 prices 480p at 0.7 but 1080p at 0.12).
 *
 * Pure module: parsing and judgement only, no I/O.
 */

import type { CostEntry, CostUnit } from "./cost-ledger";
import { classifyModel, type Classification } from "./classify";


/** One model row as returned by new-api `/api/pricing`. */
export type PricingRow = {
  model_name?: string;
  quota_type?: number;
  model_ratio?: number;
  model_price?: number;
  completion_ratio?: number;
  enable_groups?: string[];
  supported_endpoint_types?: string[];
  /** Per-second video price keyed by resolution, e.g. {"720p": 0.08}. */
  video_price?: Record<string, number>;
  /** Per-image price keyed by resolution tier, e.g. {"1k": 0.1}. */
  image_price?: Record<string, number>;
  billing_mode?: string;
  billing_expr?: string;
  description?: string;
  /**
   * Kacang schema (a customized new-api fork): explicit prices instead of
   * ratio multipliers. Present here, absent on 云飞/小安 — and vice versa.
   */
  price?: PriceBlock;
  group_prices?: Record<string, PriceBlock>;
  retail_ratio_by_group?: Record<string, number>;
  pricing_badges?: string[];
  tags?: string;
};

/** Explicit price block used by the Kacang schema. */
export type PriceBlock = {
  currency?: string;
  /** "1M_tokens" | "request" | "second" | ... */
  unit?: string;
  input?: number;
  output?: number;
  cache?: number;
  request?: number;
  second?: number;
  /** Time-of-use or size tiers; the spread between them is real cost risk. */
  tiers?: Array<{ label?: string; unit?: string; input?: number; output?: number; request?: number; second?: number }>;
};


export type PricingPayload = {
  data?: PricingRow[];
  group_ratio?: Record<string, number>;
  success?: boolean;
};

/** How the cost figure was arrived at — shown to the human before they accept it. */
export type CostDerivation = {
  modelName: string;
  channel: string;
  unit: CostUnit;
  /** Cost under the group policy in force. */
  cost: number;
  /** Lowest and highest cost across enabled groups; equal when only one group. */
  minCost: number;
  maxCost: number;
  /** Group whose ratio produced `cost`. */
  groupUsed: string | null;
  groups: string[];
  /** Resolution key when the cost came from video_price / image_price. */
  resolution: string | null;
  /** Plain-language explanation of the arithmetic. */
  explanation: string;
  warnings: CostWarning[];
  /** Separate input price for token billing, when the upstream states one. */
  inputCost?: number | null;
  /** Cached-input price for token billing, when the upstream states one. */
  cacheCost?: number | null;
  /** Modality classification and how confident it is. */
  classification?: Classification;
};



export type CostWarning = {
  code:
    | "group_spread"
    | "resolution_inversion"
    | "missing_price"
    | "sec_without_video_price"
    | "tiered_expr"
    | "zero_cost"
    | "tier_spread"
    | "currency_converted"
    | "unit_mismatch";

  severity: "block" | "warn";
  message: string;
};


export type GroupPolicy = "highest" | "lowest";

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Resolve the group ratios that apply to a model.
 * A model with no enabled groups falls back to ratio 1 so its base price is
 * still reported rather than silently dropped.
 */
function groupRatiosFor(
  row: PricingRow,
  groupRatio: Record<string, number>,
): Array<{ group: string | null; ratio: number }> {
  const groups = (row.enable_groups ?? []).filter((group) => typeof group === "string");
  const resolved = groups
    .map((group) => ({ group, ratio: finite(groupRatio[group]) }))
    .filter((entry): entry is { group: string; ratio: number } => entry.ratio !== null);
  return resolved.length > 0 ? resolved : [{ group: null, ratio: 1 }];
}

/**
 * Flag a resolution map where a higher resolution costs less.
 *
 * Video pricing should rise with resolution; an inversion means the upstream
 * table is mis-keyed or a decimal slipped. Selling against such a table can
 * mean paying many times the assumed cost.
 */
export function detectResolutionInversion(
  prices: Record<string, number>,
): { lower: string; higher: string; ratio: number } | null {
  const rank = (key: string): number => {
    const normalized = key.trim().toLowerCase();
    const match = /^(\d+)\s*k$/.exec(normalized);
    if (match) return Number(match[1]) * 1000;
    const pixels = /^(\d+)p$/.exec(normalized);
    if (pixels) return Number(pixels[1]);
    return Number.NaN;
  };

  const entries = Object.entries(prices)
    .map(([key, value]) => ({ key, value: finite(value), rank: rank(key) }))
    .filter(
      (entry): entry is { key: string; value: number; rank: number } =>
        entry.value !== null && Number.isFinite(entry.rank) && entry.value > 0,
    )
    .sort((a, b) => a.rank - b.rank);

  for (let index = 1; index < entries.length; index += 1) {
    const lower = entries[index - 1];
    const higher = entries[index];
    // Only flag a clear inversion; tiny differences are plausible pricing.
    if (higher.value < lower.value * 0.9) {
      return { lower: lower.key, higher: higher.key, ratio: lower.value / higher.value };
    }
  }
  return null;
}

/** Ratio above which a multi-group spread is worth a human decision. */
const GROUP_SPREAD_THRESHOLD = 1.5;

/**
 * CNY→USD rate used to normalize the Kacang schema onto the ledger.
 *
 * Set to 1 per the operator's instruction: these upstreams quote CNY and USD
 * figures that are already at parity for settlement purposes, so converting
 * at a market FX rate would misstate cost. Kept as a named constant (and a
 * --fx override) so the assumption is visible rather than buried.
 */
export const DEFAULT_CNY_PER_USD = 1;


/** Highest value across a price block's tiers for one field. */
function tierExtremes(
  block: PriceBlock,
  field: "input" | "output" | "request" | "second",
): { min: number; max: number } | null {
  const values = [finite(block[field])]
    .concat((block.tiers ?? []).map((tier) => finite(tier[field])))
    .filter((value): value is number => value !== null && value > 0);
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Derive cost from the Kacang explicit-price schema.
 *
 * Differs from the ratio schema in three ways that matter: prices are given
 * per group rather than as multipliers, the currency may be CNY, and `tiers`
 * encode time-of-use pricing whose peak can be double the off-peak rate.
 */
function deriveFromPriceBlocks(input: {
  row: PricingRow;
  channel: string;
  policy: GroupPolicy;
  cnyPerUsd: number;
}): CostDerivation | null {
  const { row, channel, policy, cnyPerUsd } = input;
  const modelName = row.model_name!.trim();
  const warnings: CostWarning[] = [];

  const blocks: Array<{ group: string | null; block: PriceBlock }> = [];
  for (const [group, block] of Object.entries(row.group_prices ?? {})) {
    blocks.push({ group, block });
  }
  if (blocks.length === 0 && row.price) blocks.push({ group: null, block: row.price });
  if (blocks.length === 0) return null;

  // Cost each group, then pick per policy. A group priced per request and a
  // group priced per 1M tokens are not comparable, so they are kept apart and
  // the per-call reading wins only when it is the sole option.
  type Priced = { group: string | null; unit: CostUnit; cost: number; inputCost: number | null; cacheCost: number | null; currency: string; tierSpread: number };

  const priced: Priced[] = [];
  for (const { group, block } of blocks) {
    const currency = (block.currency ?? "USD").toUpperCase();
    const toUsd = (value: number): number => (currency === "CNY" ? value / cnyPerUsd : value);
    const unitRaw = (block.unit ?? "").toLowerCase();

    if (unitRaw === "request" || unitRaw === "image") {
      const extremes = tierExtremes(block, "request");
      if (!extremes) continue;
      priced.push({
        group,
        unit: "per_call",
        cost: toUsd(extremes.max),
        inputCost: null,
        cacheCost: null,
        currency,
        tierSpread: extremes.min > 0 ? extremes.max / extremes.min : 1,
      });
      continue;
    }

    if (unitRaw === "second") {
      const extremes = tierExtremes(block, "second");
      if (!extremes) continue;
      priced.push({
        group,
        unit: "per_second",
        cost: toUsd(extremes.max),
        inputCost: null,
        cacheCost: null,
        currency,
        tierSpread: extremes.min > 0 ? extremes.max / extremes.min : 1,
      });
      continue;
    }
    // Default: token pricing per 1M.
    const output = tierExtremes(block, "output");
    const inputExtremes = tierExtremes(block, "input");
    if (!output && !inputExtremes) continue;
    const outputCost = output ? toUsd(output.max) : toUsd(inputExtremes!.max);
    const spreadSource = output ?? inputExtremes!;
    const cacheValue = finite(block.cache);
    priced.push({
      group,
      unit: "token",
      cost: outputCost,
      inputCost: inputExtremes ? toUsd(inputExtremes.max) : null,
      // The upstream's own cache discount is preserved rather than recomputed:
      // measured cache/input ratios across Kacang range from 0.02 to 0.29, so
      // a single assumed discount would misprice most models.
      cacheCost: cacheValue !== null ? toUsd(cacheValue) : null,
      currency,
      tierSpread: spreadSource.min > 0 ? spreadSource.max / spreadSource.min : 1,
    });
  }

  if (priced.length === 0) return null;

  // Groups priced in different units are NOT comparable: 0.055 CNY/request and
  // 1.2 CNY/1M-tokens are different quantities, and ranking them together
  // produced a meaningless "218× spread". Compare only within the dominant
  // unit, and report the alternative separately.
  const unitCounts = new Map<CostUnit, number>();
  for (const entry of priced) unitCounts.set(entry.unit, (unitCounts.get(entry.unit) ?? 0) + 1);
  const dominantUnit = [...unitCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const sameUnit = priced.filter((entry) => entry.unit === dominantUnit);
  const otherUnits = priced.filter((entry) => entry.unit !== dominantUnit);

  const sorted = [...sameUnit].sort((a, b) => a.cost - b.cost);
  const chosen = policy === "highest" ? sorted[sorted.length - 1] : sorted[0];
  const minCost = sorted[0].cost;
  const maxCost = sorted[sorted.length - 1].cost;

  if (otherUnits.length > 0) {
    const alt = otherUnits
      .map((entry) => `${entry.group ?? "default"}=${entry.cost.toFixed(6)} ${entry.unit === "per_call" ? "美元/次" : entry.unit === "per_second" ? "美元/秒" : "美元/1M"}`)
      .join("，");
    warnings.push({
      code: "group_spread",
      severity: "warn",
      message: `该模型还有按不同单位计价的分组（${alt}），与主单位不可直接比较，未计入成本区间。选用这些分组时需单独核算。`,
    });
  }

  if (minCost > 0 && maxCost / minCost >= GROUP_SPREAD_THRESHOLD) {
    warnings.push({
      code: "group_spread",
      severity: "warn",
      message: `该模型在 ${sameUnit.length} 个分组间成本相差 ${(maxCost / minCost).toFixed(1)}×（最低 ${minCost.toFixed(6)}，最高 ${maxCost.toFixed(6)} 美元）。已按${policy === "highest" ? "最高" : "最低"}分组计算。`,
    });
  }

  // Time-of-use pricing: billing at the peak rate is a real possibility, so
  // costing at off-peak would understate it.
  if (chosen.tierSpread >= GROUP_SPREAD_THRESHOLD) {
    const badges = row.pricing_badges?.join("/") ?? "tiers";
    warnings.push({
      code: "tier_spread",
      severity: "warn",
      message: `该模型存在分时/分档计价（${badges}），档位间相差 ${chosen.tierSpread.toFixed(1)}×。已按最贵档位计算成本。`,
    });
  }

  if (chosen.currency === "CNY" && cnyPerUsd !== 1) {
    warnings.push({
      code: "currency_converted",
      severity: "warn",
      message: `上游以人民币计价，已按 1 USD = ${cnyPerUsd} CNY 折算。汇率变动会影响毛利。`,
    });
  }


  const unitLabel = chosen.unit === "per_second" ? "美元/秒" : chosen.unit === "per_call" ? "美元/次" : "美元每 1M tokens";

  // A video or image model priced per 1M tokens is legitimate on some
  // upstreams (Seedance derives token count from resolution × duration), but
  // it is easy to misread as a text price and quote 45.5 per million tokens
  // for a video. Say so rather than letting the unit column imply chat.
  const classification = classifyModel(row);
  if (chosen.unit === "token" && (classification.category === "video" || classification.category === "image")) {
    warnings.push({
      code: "unit_mismatch",
      severity: "warn",
      message: `上游把这个${classification.category === "video" ? "视频" : "图片"}模型按 1M tokens 计价（token 数由分辨率/时长换算）。不能当文本价理解，定价前需确认单位换算关系。`,
    });
  }

  return {
    modelName,
    channel,
    unit: chosen.unit,
    cost: chosen.cost,
    minCost,
    maxCost,
    groupUsed: chosen.group,
    groups: blocks.map((entry) => entry.group).filter((group): group is string => group !== null),
    resolution: null,
    explanation: `group_prices[${chosen.group ?? "default"}] ${chosen.currency} → ${chosen.cost.toFixed(6)} ${unitLabel}${chosen.inputCost !== null ? `（输入 ${chosen.inputCost.toFixed(6)}）` : ""}`,
    warnings,
    inputCost: chosen.inputCost,
    cacheCost: chosen.cacheCost,
    classification,
  };
}


/**
 * Derive cost for one model row.
 *
 * Returns null for rows that carry no usable price at all, so callers can
 * report them as "no price found" rather than inventing a zero.
 */
export function deriveCost(input: {
  row: PricingRow;
  channel: string;
  groupRatio: Record<string, number>;
  policy: GroupPolicy;
  cnyPerUsd?: number;
}): CostDerivation | null {
  const { row, channel, groupRatio, policy } = input;
  const modelName = row.model_name?.trim();
  if (!modelName) return null;

  // Kacang runs a customized new-api fork that states prices explicitly
  // instead of as ratios. Detect by shape, not by channel name, so a schema
  // change on any upstream is handled rather than misread as "no price".
  if (row.price || row.group_prices) {
    const fromBlocks = deriveFromPriceBlocks({
      row,
      channel,
      policy,
      cnyPerUsd: input.cnyPerUsd ?? DEFAULT_CNY_PER_USD,
    });
    if (fromBlocks) return fromBlocks;
  }

  const ratios = groupRatiosFor(row, groupRatio);
  const sortedRatios = [...ratios].sort((a, b) => a.ratio - b.ratio);
  const chosen = policy === "highest" ? sortedRatios[sortedRatios.length - 1] : sortedRatios[0];
  const groups = ratios.map((entry) => entry.group).filter((group): group is string => group !== null);
  const warnings: CostWarning[] = [];

  // A wide group spread is not an error, but picking silently would hide an
  // 18× cost difference behind a single number.
  const minRatio = sortedRatios[0].ratio;
  const maxRatio = sortedRatios[sortedRatios.length - 1].ratio;
  if (minRatio > 0 && maxRatio / minRatio >= GROUP_SPREAD_THRESHOLD) {
    warnings.push({
      code: "group_spread",
      severity: "warn",
      message: `该模型在 ${ratios.length} 个分组间成本相差 ${(maxRatio / minRatio).toFixed(1)}×（最低 ${minRatio}，最高 ${maxRatio}）。已按${policy === "highest" ? "最高" : "最低"}分组计算。`,
    });
  }

  if (row.billing_mode === "tiered_expr") {
    warnings.push({
      code: "tiered_expr",
      severity: "block",
      message: `该模型使用分层表达式计价，成本随请求长度变化，无法用单一数值表示：${row.billing_expr ?? ""}`,
    });
  }

  // --- per-second video ---------------------------------------------------
  const videoPrice = row.video_price;
  if (videoPrice && Object.keys(videoPrice).length > 0) {
    const inversion = detectResolutionInversion(videoPrice);
    if (inversion) {
      warnings.push({
        code: "resolution_inversion",
        severity: "block",
        message: `分辨率价格倒挂：${inversion.lower} 比 ${inversion.higher} 贵 ${inversion.ratio.toFixed(1)}×（${JSON.stringify(videoPrice)}）。疑似上游配置错误，按此定价可能远超预期成本。`,
      });
    }
    // Cost the most expensive resolution: the customer picks, not you.
    const entries = Object.entries(videoPrice)
      .map(([key, value]) => ({ key, value: finite(value) }))
      .filter((entry): entry is { key: string; value: number } => entry.value !== null);
    if (entries.length > 0) {
      const dearest = entries.reduce((a, b) => (b.value > a.value ? b : a));
      const cost = dearest.value * chosen.ratio;
      return {
        modelName,
        channel,
        unit: "per_second",
        cost,
        minCost: dearest.value * minRatio,
        maxCost: dearest.value * maxRatio,
        groupUsed: chosen.group,
        groups,
        resolution: dearest.key,
        explanation: `video_price[${dearest.key}]=${dearest.value} × 分组倍率 ${chosen.ratio}${chosen.group ? `（${chosen.group}）` : ""} = ${cost} 美元/秒`,
        warnings,
        classification: classifyModel(row),
      };
    }
  }

  // A -sec model with no video_price cannot be costed per second.
  if (/-sec(-|$)/.test(modelName) && !videoPrice) {
    warnings.push({
      code: "sec_without_video_price",
      severity: "block",
      message: "模型名带 -sec（按秒计费）但没有 video_price，无法确定每秒成本。",
    });
  }

  // --- per-call (images and fixed-price models) ---------------------------
  const modelPrice = finite(row.model_price);
  if (row.quota_type === 1 && modelPrice !== null && modelPrice > 0) {
    const imagePrice = row.image_price;
    let base = modelPrice;
    let resolution: string | null = null;
    if (imagePrice && Object.keys(imagePrice).length > 0) {
      const entries = Object.entries(imagePrice)
        .map(([key, value]) => ({ key, value: finite(value) }))
        .filter((entry): entry is { key: string; value: number } => entry.value !== null);
      if (entries.length > 0) {
        const dearest = entries.reduce((a, b) => (b.value > a.value ? b : a));
        base = dearest.value;
        resolution = dearest.key;
      }
    }
    const cost = base * chosen.ratio;
    return {
      modelName,
      channel,
      unit: "per_call",
      cost,
      minCost: base * minRatio,
      maxCost: base * maxRatio,
      groupUsed: chosen.group,
      groups,
      resolution,
      explanation: `${resolution ? `image_price[${resolution}]` : "model_price"}=${base} × 分组倍率 ${chosen.ratio}${chosen.group ? `（${chosen.group}）` : ""} = ${cost} 美元/次`,
      warnings,
      classification: classifyModel(row),
    };
  }

  // --- token billing ------------------------------------------------------
  const modelRatio = finite(row.model_ratio);
  if (row.quota_type === 0 && modelRatio !== null && modelRatio > 0) {
    // new-api convention: USD per 1M tokens = model_ratio × 2.
    const inputCost = modelRatio * 2 * chosen.ratio;
    const completion = finite(row.completion_ratio) ?? 1;
    const outputCost = inputCost * completion;
    return {
      modelName,
      channel,
      unit: "token",
      cost: outputCost,
      minCost: modelRatio * 2 * minRatio * completion,
      maxCost: modelRatio * 2 * maxRatio * completion,
      groupUsed: chosen.group,
      groups,
      resolution: null,
      explanation: `model_ratio=${modelRatio} → 输入 ${inputCost.toFixed(6)} / 输出 ${outputCost.toFixed(6)} 美元每 1M tokens（分组倍率 ${chosen.ratio}${chosen.group ? `，${chosen.group}` : ""}，completion_ratio=${completion}）`,
      warnings,
      inputCost,
      // This schema states no cache price; new-api bills cached input at the
      // input rate unless a channel overrides it, so leaving it null is
      // honest rather than assuming a discount that may not exist.
      cacheCost: null,
      classification: classifyModel(row),
    };
  }

  warnings.push({
    code: "missing_price",
    severity: "block",
    message: `无法从 /api/pricing 推导成本：quota_type=${row.quota_type}, model_price=${row.model_price}, model_ratio=${row.model_ratio}。`,
  });
  return {
    modelName,
    channel,
    unit: row.quota_type === 1 ? "per_call" : "token",
    cost: 0,
    minCost: 0,
    maxCost: 0,
    groupUsed: chosen.group,
    groups,
    resolution: null,
    explanation: "未找到可用价格字段。",
    warnings,
    classification: classifyModel(row),
  };
}

/** A derivation is safe to write only when nothing blocks it and cost is real. */
export function isAcceptable(derivation: CostDerivation): boolean {
  if (derivation.warnings.some((warning) => warning.severity === "block")) return false;
  return derivation.cost > 0;
}

/** Convert an accepted derivation into a ledger entry. */
export function toCostEntry(
  derivation: CostDerivation,
  options: { effectiveFrom: string; inputCost?: number },
): CostEntry {
  const base: CostEntry = {
    modelName: derivation.modelName,
    channel: derivation.channel,
    unit: derivation.unit,
    currency: "USD",
    effectiveFrom: options.effectiveFrom,
    note: derivation.explanation,
  };
  if (derivation.unit === "token") {
    base.inputCost = options.inputCost ?? derivation.inputCost ?? derivation.cost;
    base.outputCost = derivation.cost;
  } else {

    base.unitCost = derivation.cost;
  }
  return base;
}
