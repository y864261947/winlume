import { describe, expect, it } from "vitest";
import { workbookFromCreateSheets } from "./sheet-content";
import { summarizeSheetContent } from "./sheet-summary";

describe("summarizeSheetContent", () => {
  it("includes sheet names, values, and formulas", () => {
    const created = workbookFromCreateSheets([
      {
        name: "收入",
        values: [
          ["月份", "金额"],
          ["1月", 100],
        ],
        formulas: [{ cell: "B3", formula: "=SUM(B2)" }],
      },
    ]);
    if (!("content" in created)) throw new Error(created.error);
    const text = summarizeSheetContent(created.content);
    expect(text).toContain('Sheet "收入"');
    expect(text).toContain("1月");
    expect(text).toContain("100");
    expect(text).toContain("B3=SUM(B2)");
  });
});
