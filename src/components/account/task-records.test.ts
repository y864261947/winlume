import { describe, expect, it } from "vitest";
import type { Session } from "@/lib/agent/types";
import { filterTaskRecords } from "./task-records";

const sessions: Session[] = [
  { id: "old", userId: "a", title: "历史创作", model: "gpt-4o", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" },
  { id: "recent", userId: "a", title: "产品图片", model: "GPT-Image", createdAt: "2026-09-28T12:00:00Z", updatedAt: "2026-09-28T12:00:00Z" },
];
const asOf = Date.parse("2026-09-29T12:00:00Z");
describe("account task records", () => {
  it("filters by title or model and retains the exact lookback boundary", () => {
    expect(filterTaskRecords(sessions, " gpt-image ", 1, asOf).map(s => s.id)).toEqual(["recent"]);
    expect(filterTaskRecords(sessions, "产品", 1, asOf).map(s => s.id)).toEqual(["recent"]);
    expect(filterTaskRecords(sessions, "历史", 7, asOf)).toEqual([]);
  });
  it("sorts all records without altering source data or synthesizing run metrics", () => {
    expect(filterTaskRecords(sessions, "", null, asOf)).toEqual([sessions[1], sessions[0]]);
    expect(sessions[0].id).toBe("old");
    expect(filterTaskRecords(sessions, "", null, asOf)[0]).not.toHaveProperty("progress");
  });
});
