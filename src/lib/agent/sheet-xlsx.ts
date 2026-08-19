import ExcelJS from "exceljs";
import {
  MAX_COLS,
  MAX_GRID_CELLS,
  MAX_ROWS,
  MAX_SHEETS,
  emptyGrid,
  putSheetCell,
  sanitizeFormula,
  type SheetArtifactContent,
  type SheetCell,
  type SheetCellValue,
  type SheetGrid,
  type SheetImportMeta,
} from "@/lib/agent/sheet-content";

export {
  MAX_SHEET_UPLOAD_BYTES,
  isLegacyXlsFile,
  isSpreadsheetFile,
  workbookTitleFromFileName,
} from "@/lib/agent/sheet-file";

export async function parseXlsxToSheetContent(
  bytes: Buffer | Uint8Array,
  sourceName: string,
): Promise<{ content: SheetArtifactContent } | { error: string }> {
  const workbook = new ExcelJS.Workbook();
  try {
    const load = workbook.xlsx.load.bind(workbook.xlsx) as unknown as (
      data: Uint8Array,
    ) => Promise<ExcelJS.Workbook>;
    await load(Buffer.from(bytes));
  } catch {
    return { error: "无法解析该 Excel 文件。请确认它是未加密的 .xlsx" };
  }

  const worksheets = workbook.worksheets.filter((sheet) => sheet && sheet.state !== "veryHidden");
  if (!worksheets.length) return { error: "工作簿里没有可导入的工作表" };

  const grids: SheetGrid[] = [];
  let truncatedSheets = worksheets.length > MAX_SHEETS;
  let truncatedRows = false;
  let truncatedCols = false;
  let sourceRows = 0;
  let sourceCols = 0;
  let cellCount = 0;
  let hitCellCap = false;

  for (const worksheet of worksheets.slice(0, MAX_SHEETS)) {
    const name = (worksheet.name || `Sheet${grids.length + 1}`).trim().slice(0, 80);
    const grid = emptyGrid(`sheet-${grids.length + 1}`, name || `Sheet${grids.length + 1}`);
    const dim = worksheet.dimensions;
    const maxRow = dim?.bottom ?? worksheet.rowCount ?? 0;
    const maxCol = dim?.right ?? worksheet.columnCount ?? 0;
    sourceRows = Math.max(sourceRows, maxRow);
    sourceCols = Math.max(sourceCols, maxCol);
    if (maxRow > MAX_ROWS) truncatedRows = true;
    if (maxCol > MAX_COLS) truncatedCols = true;

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (hitCellCap || rowNumber > MAX_ROWS) return;
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (hitCellCap || colNumber > MAX_COLS) return;
        const mapped = mapExcelCell(cell);
        if (!mapped) return;
        if (cellCount >= MAX_GRID_CELLS) {
          hitCellCap = true;
          truncatedRows = true;
          return;
        }
        putSheetCell(grid, rowNumber - 1, colNumber - 1, mapped);
        cellCount += 1;
      });
    });

    grids.push(grid);
  }

  if (!grids.length) return { error: "工作簿没有可读取的单元格" };

  const importMeta: SheetImportMeta = {
    sourceName: sourceName.trim().slice(0, 200) || "workbook.xlsx",
    sourceRows,
    sourceCols,
    ...(truncatedRows ? { truncatedRows: true } : {}),
    ...(truncatedCols ? { truncatedCols: true } : {}),
    ...(truncatedSheets ? { truncatedSheets: true } : {}),
  };

  return {
    content: {
      revision: 1,
      activeSheetId: grids[0]!.id,
      sheets: grids,
      importMeta,
    },
  };
}

function mapExcelCell(cell: ExcelJS.Cell): SheetCell | null {
  const formula = extractFormula(cell);
  const value = extractValue(cell);
  if (!formula && value === undefined) return null;
  const mapped: SheetCell = {};
  if (formula) mapped.f = formula;
  if (value !== undefined) mapped.v = value;
  return mapped;
}

function extractFormula(cell: ExcelJS.Cell): string | null {
  const raw = cell.formula || (typeof cell.value === "object" && cell.value && "formula" in cell.value
    ? String((cell.value as { formula?: unknown }).formula ?? "")
    : "");
  if (!raw) return null;
  return sanitizeFormula(raw);
}

function extractValue(cell: ExcelJS.Cell): SheetCellValue | undefined {
  const value = cell.value;
  if (value === null || value === undefined) {
    if (cell.result !== undefined && cell.result !== null && typeof cell.result !== "object") {
      return asCellValue(cell.result);
    }
    return undefined;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return asCellValue(value);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  }
  if (typeof value === "object") {
    const formulaValue = value as {
      formula?: unknown;
      result?: unknown;
      text?: unknown;
      richText?: Array<{ text?: string }>;
      hyperlink?: unknown;
      error?: unknown;
    };
    if (formulaValue.result !== undefined && formulaValue.result !== null) {
      return asCellValue(formulaValue.result);
    }
    if (typeof formulaValue.text === "string") return asCellValue(formulaValue.text);
    if (Array.isArray(formulaValue.richText)) {
      return asCellValue(formulaValue.richText.map((part) => part.text ?? "").join(""));
    }
    if (typeof formulaValue.error === "string") return formulaValue.error;
  }
  return undefined;
}

function asCellValue(value: unknown): SheetCellValue | undefined {
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.length > 2000 ? value.slice(0, 2000) : value;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString().slice(0, 10);
  }
  return undefined;
}
