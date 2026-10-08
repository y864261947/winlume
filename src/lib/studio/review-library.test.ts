import { describe, expect, it } from "vitest";
import { libraryTaskHref } from "./review-library";

describe("library task handoff", () => {
  it("preserves an editable brief and distinct skill ids without submitting a task", () => {
    const url = new URL(libraryTaskHref("请分析 A&B / 不要自动提交", ["research/a", "writer", "research/a"]), "https://example.test");
    expect(url.pathname).toBe("/studio");
    expect(url.searchParams.get("prompt")).toBe("请分析 A&B / 不要自动提交");
    expect(url.searchParams.getAll("skill")).toEqual(["research/a", "writer"]);
    expect([...url.searchParams.keys()]).toEqual(["prompt", "skill", "skill"]);
  });
  it("bounds the handoff to ten selected skills", () => {
    const url = new URL(libraryTaskHref("", Array.from({ length: 12 }, (_, i) => `skill-${i}`)), "https://example.test");
    expect(url.searchParams.getAll("skill")).toHaveLength(10);
    expect(url.searchParams.has("prompt")).toBe(false);
  });
});
