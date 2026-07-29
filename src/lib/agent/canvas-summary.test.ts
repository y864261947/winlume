import { describe, expect, it } from "vitest";
import { summarizeCanvasElements } from "./canvas-summary";
import type { CanvasElement } from "./canvas-content";

describe("summarizeCanvasElements", () => {
  it("returns a placeholder for an empty canvas", () => {
    expect(summarizeCanvasElements([])).toBe("(canvas is empty)");
  });

  it("lists text labels and shape counts", () => {
    const elements: CanvasElement[] = [
      { id: "1", type: "rectangle" },
      { id: "2", type: "text", text: "Deploy" },
      { id: "3", type: "text", text: "Review" },
      { id: "4", type: "arrow", startBinding: { elementId: "1" }, endBinding: { elementId: "2" } },
    ];

    const summary = summarizeCanvasElements(elements);
    expect(summary).toContain("Deploy");
    expect(summary).toContain("Review");
    expect(summary).toContain("1 rectangle");
    expect(summary).toContain("1 connection");
  });

  it("handles elements without text gracefully", () => {
    expect(() => summarizeCanvasElements([{ id: "freehand-1", type: "freedraw" }])).not.toThrow();
  });
});
