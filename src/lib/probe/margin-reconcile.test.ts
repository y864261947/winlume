import { describe, expect, it } from "vitest";
import {
  QUOTA_PER_UNIT,
  lossMakers,
  reconcileRow,
  summarizeMargins,
  type RelayLogRow,
} from "./margin-reconcile";

const row = (over: Partial<RelayLogRow> = {}): RelayLogRow => ({
  modelName: "gpt-image-2.5",
  channelId: 74,
  quota: 50_000,
  createdAt: 1_700_000_000,
  ...over,
});

describe("joining new-api revenue to the cost ledger", () => {
  // Real production shape: quota=50000 on channel 74 (kk-image → 云飞),
  // which is 0.1 credits of revenue against a 0.008 upstream cost.
  it("computes margin from a real log row", () => {
    const r = reconcileRow(row(), () => 0.008);
    expect(r.revenue).toBeCloseTo(0.1, 10);
    expect(r.cost).toBe(0.008);
    expect(r.profit).toBeCloseTo(0.092, 10);
    expect(r.margin).toBeCloseTo(0.92, 6);
  });

  it("uses new-api's quota_per_unit convention", () => {
    expect(QUOTA_PER_UNIT).toBe(500_000);
    expect(reconcileRow(row({ quota: 500_000 }), () => 0).revenue).toBe(1);
  });

  // A missing cost and a zero cost are commercially opposite; collapsing
  // them would report a free upstream as 100% margin.
  it("reports why a margin is unavailable instead of assuming zero cost", () => {
    const r = reconcileRow(row(), () => null);
    expect(r.cost).toBeNull();
    expect(r.margin).toBeNull();
    expect(r.unavailableReason).toContain("成本台账中没有");
  });

  it("does not report an infinite margin on a zero-revenue call", () => {
    const r = reconcileRow(row({ quota: 0 }), () => 0.008);
    expect(r.margin).toBeNull();
    expect(r.profit).toBeCloseTo(-0.008, 10);
    expect(r.unavailableReason).toContain("未产生收入");
  });

  it("surfaces a negative margin rather than clamping it", () => {
    const r = reconcileRow(row({ quota: 5_000 }), () => 0.07);
    expect(r.profit!).toBeLessThan(0);
    expect(r.margin!).toBeCloseTo((0.01 - 0.07) / 0.01, 6);
  });
});

describe("aggregation", () => {
  // The same model on two channels can have opposite margins; averaging
  // across them hides the case worth acting on.
  it("keeps channels separate", () => {
    const rows = [
      reconcileRow(row({ channelId: 74 }), () => 0.008),
      reconcileRow(row({ channelId: 220 }), () => 0.07),
    ];
    const summaries = summarizeMargins(rows);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].channelId).toBe(220);
    expect(summaries[0].margin).toBeLessThan(summaries[1].margin);
  });

  it("excludes unpriced calls from totals but counts them", () => {
    const rows = [
      reconcileRow(row(), () => 0.008),
      reconcileRow(row(), () => null),
    ];
    const [summary] = summarizeMargins(rows);
    expect(summary.calls).toBe(2);
    expect(summary.unpriced).toBe(1);
    expect(summary.cost).toBeCloseTo(0.008, 10);
    expect(summary.revenue).toBeCloseTo(0.1, 10);
  });

  it("sorts worst margin first", () => {
    const rows = [
      reconcileRow(row({ modelName: "good" }), () => 0.001),
      reconcileRow(row({ modelName: "bad" }), () => 0.099),
    ];
    expect(summarizeMargins(rows)[0].modelName).toBe("bad");
  });

  it("identifies models selling at or below cost", () => {
    const rows = [
      reconcileRow(row({ modelName: "profitable" }), () => 0.01),
      reconcileRow(row({ modelName: "underwater" }), () => 0.5),
    ];
    const losses = lossMakers(summarizeMargins(rows));
    expect(losses.map((l) => l.modelName)).toEqual(["underwater"]);
  });
});
