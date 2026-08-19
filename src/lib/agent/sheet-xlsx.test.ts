import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { getCell } from "./sheet-content";
import {
  isLegacyXlsFile,
  isSpreadsheetFile,
  workbookTitleFromFileName,
} from "./sheet-file";
import { parseXlsxToSheetContent } from "./sheet-xlsx";

async function xlsxBytes(build: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe("spreadsheet file detection", () => {
  it("accepts xlsx names and mime types", () => {
    expect(
      isSpreadsheetFile({
        name: "a.xlsx",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ).toBe(true);
    expect(isSpreadsheetFile({ name: "notes.csv", type: "text/csv" })).toBe(false);
    expect(isLegacyXlsFile({ name: "old.xls", type: "application/vnd.ms-excel" })).toBe(true);
  });

  it("strips the extension for the artifact title", () => {
    expect(workbookTitleFromFileName("明泰克斯(Mintex)OE对应.xlsx")).toBe(
      "明泰克斯(Mintex)OE对应",
    );
  });
});

describe("parseXlsxToSheetContent", () => {
  it("imports values and formulas from multiple worksheets", async () => {
    const bytes = await xlsxBytes((wb) => {
      const prices = wb.addWorksheet("价格");
      prices.getCell("A1").value = "OE号";
      prices.getCell("B1").value = "价格";
      prices.getCell("A2").value = "123";
      prices.getCell("B2").value = 88.5;
      prices.getCell("B3").value = { formula: "SUM(B2)", result: 88.5 };
      wb.addWorksheet("备注").getCell("A1").value = "Mintex";
    });

    const parsed = await parseXlsxToSheetContent(bytes, "mintex.xlsx");
    expect("content" in parsed).toBe(true);
    if (!("content" in parsed)) return;
    expect(parsed.content.sheets.map((s) => s.name)).toEqual(["价格", "备注"]);
    expect(getCell(parsed.content.sheets[0]!, 0, 0)?.v).toBe("OE号");
    expect(getCell(parsed.content.sheets[0]!, 1, 1)?.v).toBe(88.5);
    expect(getCell(parsed.content.sheets[0]!, 2, 1)?.f).toBe("=SUM(B2)");
    expect(parsed.content.importMeta?.sourceName).toBe("mintex.xlsx");
  });

  it("rejects an empty buffer", async () => {
    const parsed = await parseXlsxToSheetContent(Buffer.from("not-xlsx"), "bad.xlsx");
    expect("error" in parsed).toBe(true);
  });
});
