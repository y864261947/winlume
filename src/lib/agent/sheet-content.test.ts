import { describe, expect, it } from "vitest";
import {
  applySheetOperations,
  colToLetters,
  compactToUniverSnapshot,
  emptyWorkbook,
  parseA1,
  parseA1Range,
  parseSheetContent,
  sheetToCsv,
  univerSnapshotToCompact,
  workbookFromCreateSheets,
  getCell,
} from "./sheet-content";

describe("A1 helpers", () => {
  it("parses and prints addresses", () => {
    expect(parseA1("A1")).toEqual({ row: 0, col: 0 });
    expect(parseA1("B3")).toEqual({ row: 2, col: 1 });
    expect(parseA1("AA10")).toEqual({ row: 9, col: 26 });
    expect(colToLetters(0)).toBe("A");
    expect(colToLetters(26)).toBe("AA");
    expect(parseA1("zzz")).toBeNull();
  });

  it("parses ranges in either direction", () => {
    expect(parseA1Range("C3:A1")).toEqual({
      start: { row: 0, col: 0 },
      end: { row: 2, col: 2 },
    });
  });
});

describe("workbookFromCreateSheets", () => {
  it("builds a workbook from a values rectangle and formulas", () => {
    const result = workbookFromCreateSheets([
      {
        name: "收入",
        values: [
          ["月份", "金额"],
          ["1月", 100],
          ["2月", 120],
        ],
        formulas: [{ cell: "B4", formula: "SUM(B2:B3)" }],
      },
    ]);
    expect("content" in result).toBe(true);
    if (!("content" in result)) return;
    expect(result.content.sheets[0]?.name).toBe("收入");
    expect(getCell(result.content.sheets[0]!, 1, 1)?.v).toBe(100);
    expect(getCell(result.content.sheets[0]!, 3, 1)?.f).toBe("=SUM(B2:B3)");
  });

  it("treats leading = in values as a formula", () => {
    const result = workbookFromCreateSheets([
      { name: "Sheet1", values: [["合计", "=A1"]] },
    ]);
    if (!("content" in result)) throw new Error(result.error);
    expect(getCell(result.content.sheets[0]!, 0, 1)?.f).toBe("=A1");
  });
});

describe("applySheetOperations", () => {
  it("patches values without wiping other cells", () => {
    const created = workbookFromCreateSheets([
      { name: "Sheet1", values: [["A", "B"], [1, 2]] },
    ]);
    if (!("content" in created)) throw new Error(created.error);
    const patched = applySheetOperations(created.content, [
      { op: "setValues", start: "A3", values: [[3, 4]] },
      { op: "setFormulas", start: "B4", formulas: [["=SUM(B1:B3)"]] },
    ]);
    if (!("content" in patched)) throw new Error(patched.error);
    expect(patched.content.revision).toBe(created.content.revision + 1);
    expect(getCell(patched.content.sheets[0]!, 0, 0)?.v).toBe("A");
    expect(getCell(patched.content.sheets[0]!, 2, 1)?.v).toBe(4);
    expect(getCell(patched.content.sheets[0]!, 3, 1)?.f).toBe("=SUM(B1:B3)");
  });

  it("adds and renames sheets", () => {
    const patched = applySheetOperations(emptyWorkbook(), [
      { op: "addSheet", name: "汇总" },
      { op: "renameSheet", sheet: "Sheet1", name: "明细" },
    ]);
    if (!("content" in patched)) throw new Error(patched.error);
    expect(patched.content.sheets.map((s) => s.name)).toEqual(["明细", "汇总"]);
  });

  it("rejects deleting the last sheet", () => {
    const patched = applySheetOperations(emptyWorkbook(), [
      { op: "deleteSheet", sheet: "Sheet1" },
    ]);
    expect("error" in patched).toBe(true);
  });

  it("drops the Univer snapshot so the client rebuilds from compact cells", () => {
    const base = emptyWorkbook();
    base.univerSnapshot = { id: "stale" };
    const patched = applySheetOperations(base, [
      { op: "setValues", start: "A1", values: [["x"]] },
    ]);
    if (!("content" in patched)) throw new Error(patched.error);
    expect(patched.content.univerSnapshot).toBeUndefined();
  });
});

describe("parseSheetContent", () => {
  it("rejects malformed payloads", () => {
    expect(parseSheetContent("{")).toBeNull();
    expect(parseSheetContent(JSON.stringify({ sheets: [] }))).toBeNull();
  });

  it("round-trips a valid workbook", () => {
    const created = workbookFromCreateSheets([
      { name: "A", values: [["ok"]] },
    ]);
    if (!("content" in created)) throw new Error(created.error);
    const parsed = parseSheetContent(JSON.stringify(created.content));
    expect(parsed?.sheets[0]?.name).toBe("A");
  });
});

describe("csv and univer projection", () => {
  it("exports used range as csv", () => {
    const created = workbookFromCreateSheets([
      { name: "Sheet1", values: [["a", "b"], [1, 2]] },
    ]);
    if (!("content" in created)) throw new Error(created.error);
    expect(sheetToCsv(created.content.sheets[0]!)).toBe("a,b\n1,2");
  });

  it("projects compact cells into a Univer snapshot and back", () => {
    const created = workbookFromCreateSheets([
      { name: "收入", values: [["合计"], [10]] },
    ]);
    if (!("content" in created)) throw new Error(created.error);
    const snapshot = compactToUniverSnapshot(created.content, "预算");
    const roundTrip = univerSnapshotToCompact(snapshot, created.content);
    expect(getCell(roundTrip.sheets[0]!, 1, 0)?.v).toBe(10);
    expect(roundTrip.sheets[0]?.name).toBe("收入");
  });
});
