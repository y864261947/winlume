import {
  a1Of,
  getCell,
  usedRange,
  type SheetArtifactContent,
  type SheetGrid,
} from "@/lib/agent/sheet-content";

export const SHEET_SUMMARY_MAX_ROWS = 80;
export const SHEET_SUMMARY_MAX_COLS = 20;

/**
 * Compact TSV of each worksheet's used range, for model context.
 */
export function summarizeSheetContent(content: SheetArtifactContent): string {
  if (!content.sheets.length) return "(workbook is empty)";
  const blocks = content.sheets.map((sheet) => summarizeSheetGrid(sheet, content.activeSheetId));
  const imported = content.importMeta
    ? [
        `Imported from ${content.importMeta.sourceName}` +
          (content.importMeta.sourceRows || content.importMeta.sourceCols
            ? ` (source about ${content.importMeta.sourceRows ?? "?"}×${content.importMeta.sourceCols ?? "?"})`
            : "") +
          (content.importMeta.truncatedRows ||
          content.importMeta.truncatedCols ||
          content.importMeta.truncatedSheets
            ? "; stored grid was truncated to the workbook limit"
            : ""),
      ]
    : [];
  return [...imported, ...blocks].join("\n\n");
}

export function summarizeSheetGrid(sheet: SheetGrid, activeSheetId?: string): string {
  const { rows, cols } = usedRange(sheet);
  const active = sheet.id === activeSheetId ? " (active)" : "";
  if (rows <= 0 || cols <= 0) {
    return `Sheet "${sheet.name}" id=${sheet.id}${active}: (empty)`;
  }

  const showRows = Math.min(rows, SHEET_SUMMARY_MAX_ROWS);
  const showCols = Math.min(cols, SHEET_SUMMARY_MAX_COLS);
  const lines: string[] = [
    `Sheet "${sheet.name}" id=${sheet.id}${active}: ${rows} rows × ${cols} cols`,
  ];

  const header = Array.from({ length: showCols }, (_, col) => a1Of(0, col).replace("1", ""));
  lines.push(["", ...header].join("\t"));

  for (let r = 0; r < showRows; r += 1) {
    const cells: string[] = [String(r + 1)];
    for (let c = 0; c < showCols; c += 1) {
      cells.push(formatSummaryCell(sheet, r, c));
    }
    lines.push(cells.join("\t"));
  }

  if (rows > showRows || cols > showCols) {
    lines.push(
      `(truncated; ${rows}×${cols} used, showing ${showRows}×${showCols})`,
    );
  }

  const formulas: string[] = [];
  for (let r = 0; r < showRows; r += 1) {
    for (let c = 0; c < showCols; c += 1) {
      const cell = getCell(sheet, r, c);
      if (cell?.f) formulas.push(`${a1Of(r, c)}=${cell.f.replace(/^=/, "")}`);
    }
  }
  if (formulas.length) {
    lines.push(`Formulas: ${formulas.join("; ")}`);
  }

  return lines.join("\n");
}

function formatSummaryCell(sheet: SheetGrid, row: number, col: number): string {
  const cell = getCell(sheet, row, col);
  if (!cell) return "";
  if (cell.f) return cell.f;
  if (cell.v === null || cell.v === undefined) return "";
  return String(cell.v).replace(/\t/g, " ").replace(/\n/g, " ");
}
