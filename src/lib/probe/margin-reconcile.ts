/**
 * Reconcile what new-api charged against what the upstream actually cost.
 *
 * new-api records the SALE only. A log row carries `quota` (what the customer
 * was debited) and `other.model_price` (the price used), but nothing about
 * what you paid the upstream — that lives in the cost ledger this repo
 * maintains. Real margin exists only where the two are joined, and this
 * module is that join.
 *
 * Strictly read-only with respect to new-api. Writing prices back would mean
 * this tool could silently change production billing; the ledger proposes,
 * a human disposes.
 */

/** new-api default: 500_000 quota units = 1 credit ≈ ¥1. */
export const QUOTA_PER_UNIT = 500_000;

/** One usage row as read from new-api's `logs` table. */
export type RelayLogRow = {
  modelName: string;
  channelId: number;
  /** Quota debited from the customer. */
  quota: number;
  createdAt: number;
  /** Parsed `other` JSON column, when present. */
  other?: {
    model_price?: number;
    model_ratio?: number;
    group_ratio?: number;
    completion_ratio?: number;
  } | null;
};

/** What the upstream charged you, from the cost ledger. */
export type CostLookup = (modelName: string, channelId: number) => number | null;

export type ReconciledRow = {
  modelName: string;
  channelId: number;
  /** Revenue in credits (¥ at the fixed 1:1 rate). */
  revenue: number;
  /** Upstream cost in the same unit, or null when unknown. */
  cost: number | null;
  /** revenue - cost, or null when cost is unknown. */
  profit: number | null;
  /** profit / revenue, or null. */
  margin: number | null;
  /**
   * Why a margin could not be computed. Never silently zero: a missing cost
   * and a zero cost mean completely different things commercially.
   */
  unavailableReason: string | null;
};

export function reconcileRow(row: RelayLogRow, lookup: CostLookup): ReconciledRow {
  const revenue = row.quota / QUOTA_PER_UNIT;
  const cost = lookup(row.modelName, row.channelId);

  if (cost === null) {
    return {
      modelName: row.modelName,
      channelId: row.channelId,
      revenue,
      cost: null,
      profit: null,
      margin: null,
      unavailableReason: `成本台账中没有 ${row.modelName}（渠道 ${row.channelId}）的记录。`,
    };
  }

  // A free call is real (trial credits, a zero-priced model); reporting an
  // infinite margin would be worse than admitting the number is meaningless.
  if (revenue <= 0) {
    return {
      modelName: row.modelName,
      channelId: row.channelId,
      revenue,
      cost,
      profit: -cost,
      margin: null,
      unavailableReason: "本次调用未产生收入（quota=0），毛利率无意义。",
    };
  }

  const profit = revenue - cost;
  return {
    modelName: row.modelName,
    channelId: row.channelId,
    revenue,
    cost,
    profit,
    margin: profit / revenue,
    unavailableReason: null,
  };
}

export type MarginSummary = {
  modelName: string;
  channelId: number;
  calls: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  /** Calls whose cost was unknown; excluded from the totals above. */
  unpriced: number;
};

/**
 * Aggregate per (model, channel).
 *
 * Grouping by channel as well as model is deliberate: the same model served
 * by two channels can have opposite margins, and an average across them
 * hides exactly the case worth acting on.
 */
export function summarizeMargins(rows: ReconciledRow[]): MarginSummary[] {
  const groups = new Map<string, MarginSummary>();

  for (const row of rows) {
    const key = `${row.modelName}\u0000${row.channelId}`;
    const entry = groups.get(key) ?? {
      modelName: row.modelName,
      channelId: row.channelId,
      calls: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      margin: 0,
      unpriced: 0,
    };
    entry.calls += 1;
    if (row.cost === null) {
      entry.unpriced += 1;
    } else {
      entry.revenue += row.revenue;
      entry.cost += row.cost;
    }
    groups.set(key, entry);
  }

  const out: MarginSummary[] = [];
  for (const entry of groups.values()) {
    entry.profit = entry.revenue - entry.cost;
    entry.margin = entry.revenue > 0 ? entry.profit / entry.revenue : 0;
    out.push(entry);
  }
  return out.sort((a, b) => a.margin - b.margin);
}

/** Models selling at or below cost — the reason to run this at all. */
export function lossMakers(summaries: MarginSummary[]): MarginSummary[] {
  return summaries.filter((s) => s.revenue > 0 && s.profit <= 0);
}
