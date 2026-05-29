import * as XLSX from "xlsx";

export type ExportSheets = {
  workOrders: Array<Record<string, unknown>>;
  machineUtilization: Array<Record<string, unknown>>;
  waitingAnalysis: Array<Record<string, unknown>>;
  anomalies: Array<Record<string, unknown>>;
  rawRecords: Array<Record<string, unknown>>;
};

export function exportCurrentRangeReport(fileName: string, sheets: ExportSheets): void {
  exportWorkbook(fileName, sheets);
}

export function exportFirstHalfYearReport(fileName: string, sheets: ExportSheets): void {
  exportWorkbook(fileName, sheets);
}

export function exportSecondHalfYearReport(fileName: string, sheets: ExportSheets): void {
  exportWorkbook(fileName, sheets);
}

export function exportFullYearReport(fileName: string, sheets: ExportSheets): void {
  exportWorkbook(fileName, sheets);
}

export function exportAllAnalysisReport(fileName: string, sheets: ExportSheets): void {
  exportWorkbook(fileName, sheets);
}

function exportWorkbook(fileName: string, sheets: ExportSheets): void {
  const workbook = XLSX.utils.book_new();
  appendSheet(workbook, "工作總表", sheets.workOrders);
  appendSheet(workbook, "機台利用率", sheets.machineUtilization);
  appendSheet(workbook, "等待時間分析", sheets.waitingAnalysis);
  appendSheet(workbook, "異常資料", sheets.anomalies);
  appendSheet(workbook, "原始資料", sheets.rawRecords);
  XLSX.writeFile(workbook, fileName);
}

function appendSheet(workbook: XLSX.WorkBook, name: string, rows: Array<Record<string, unknown>>): void {
  const safeRows = rows.length ? rows : [{ 提示: "目前沒有資料" }];
  const worksheet = XLSX.utils.json_to_sheet(safeRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}
