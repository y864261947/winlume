import { describe, expect, it } from "vitest";
import { buildUsageCharts } from "./usage-charts";

function todayUnix(): number {
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  return Math.floor(today.getTime() / 1000);
}

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

describe("buildUsageCharts", () => {
  it("aggregates daily and model series and drops routing internals", () => {
    const createdAt = todayUnix();
    const result = buildUsageCharts(
      [
        {
          model_name: "gpt-4o",
          created_at: createdAt,
          count: 2,
          quota: 500_000,
          token_used: 80,
          username: "team-hidden",
          use_group: "gpt-pro",
          channel_id: 9,
          token_id: 12,
          node_name: "node-a",
        } as never,
        {
          model_name: "claude-sonnet",
          created_at: createdAt,
          count: 1,
          quota: 250_000,
        },
      ],
      14,
    );

    expect(result.daily).toHaveLength(14);
    expect(result.daily.at(-1)).toEqual({
      date: todayKey(),
      credits: 1.5,
      requests: 3,
    });
    expect(result.byModel).toEqual([
      { model: "gpt-4o", credits: 1, requests: 2 },
      { model: "claude-sonnet", credits: 0.5, requests: 1 },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/gpt-pro|team-hidden|channel|token_id|node-a/i);
  });

  it("folds models beyond the top seven into 其他", () => {
    const createdAt = todayUnix();
    const rows = Array.from({ length: 9 }, (_, index) => ({
      model_name: `model-${index}`,
      created_at: createdAt,
      count: 1,
      quota: (9 - index) * 500_000,
    }));
    const result = buildUsageCharts(rows, 14);
    expect(result.byModel).toHaveLength(8);
    expect(result.byModel[0]?.model).toBe("model-0");
    expect(result.byModel.at(-1)).toEqual({ model: "其他", credits: 3, requests: 2 });
  });
});
