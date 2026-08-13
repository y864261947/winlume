import { DEFAULT_QUOTA_PER_UNIT } from "@/lib/catalog/plaza-display";
import type { ConsoleUsageModelSlice, ConsoleUsagePoint } from "./types";

export type NewApiQuotaDateRow = {
  model_name?: string;
  created_at?: number;
  count?: number;
  quota?: number;
  token_used?: number;
};

function dayKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function roundCredits(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function emptyDaily(days: number): Map<string, { credits: number; requests: number }> {
  const points = new Map<string, { credits: number; requests: number }>();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - offset);
    points.set(dayKey(day), { credits: 0, requests: 0 });
  }
  return points;
}

/**
 * Aggregates new-api quota_data rows into account-safe chart series.
 * Drops username / group / channel / token / node internals.
 */
export function buildUsageCharts(
  rows: NewApiQuotaDateRow[],
  days = 14,
): { daily: ConsoleUsagePoint[]; byModel: ConsoleUsageModelSlice[] } {
  const dailyMap = emptyDaily(days);
  const modelMap = new Map<string, { credits: number; requests: number }>();

  for (const row of rows) {
    const createdAt = typeof row.created_at === "number" ? row.created_at : 0;
    if (createdAt <= 0) continue;
    const credits = (row.quota ?? 0) / DEFAULT_QUOTA_PER_UNIT;
    const requests = row.count ?? 0;
    const day = dailyMap.get(dayKey(new Date(createdAt * 1000)));
    if (day) {
      day.credits += credits;
      day.requests += requests;
    }
    const model = (row.model_name ?? "").trim() || "unknown";
    const slice = modelMap.get(model) ?? { credits: 0, requests: 0 };
    slice.credits += credits;
    slice.requests += requests;
    modelMap.set(model, slice);
  }

  const daily = [...dailyMap.entries()].map(([date, value]) => ({
    date,
    credits: roundCredits(value.credits),
    requests: value.requests,
  }));

  const ranked = [...modelMap.entries()]
    .map(([model, value]) => ({
      model,
      credits: roundCredits(value.credits),
      requests: value.requests,
    }))
    .sort((left, right) => right.credits - left.credits || right.requests - left.requests);

  const visible = ranked.slice(0, 7);
  const rest = ranked.slice(7);
  if (rest.length > 0) {
    visible.push({
      model: "其他",
      credits: roundCredits(rest.reduce((total, item) => total + item.credits, 0)),
      requests: rest.reduce((total, item) => total + item.requests, 0),
    });
  }

  return { daily, byModel: visible };
}
