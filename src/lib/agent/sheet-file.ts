export const MAX_SHEET_UPLOAD_BYTES = 8 * 1024 * 1024;

const XLSX_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel.sheet.macroenabled.12",
  "application/vnd.ms-excel.sheet.macroenabled.12",
]);

export function isSpreadsheetFile(file: { name: string; type?: string }): boolean {
  const mime = (file.type ?? "").split(";", 1)[0]?.toLowerCase() ?? "";
  if (XLSX_MIME.has(mime)) return true;
  return /\.xlsx$/i.test(file.name) || /\.xlsm$/i.test(file.name);
}

export function isLegacyXlsFile(file: { name: string; type?: string }): boolean {
  const mime = (file.type ?? "").split(";", 1)[0]?.toLowerCase() ?? "";
  if (/\.xlsx$/i.test(file.name) || /\.xlsm$/i.test(file.name)) return false;
  if (mime === "application/vnd.ms-excel") return true;
  return /\.xls$/i.test(file.name);
}

export function workbookTitleFromFileName(name: string): string {
  const trimmed = name.trim();
  const stripped = trimmed.replace(/\.(xlsx|xlsm)$/i, "").trim();
  return (stripped || trimmed || "工作簿").slice(0, 80);
}
