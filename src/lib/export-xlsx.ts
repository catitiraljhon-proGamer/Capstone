export type XlsxColumn<Row> = {
  header: string;
  width: number;
  value: (row: Row) => string | number;
  /**
   * "peso" formats numbers as ₱1,234.56; "date" (YYYY-MM-DD) and "month" (YYYY-MM) become real Excel dates;
   * "percent" expects a fraction such as 0.25.
   */
  format?: "text" | "peso" | "date" | "month" | "percent";
};

type XlsxFormat = NonNullable<XlsxColumn<unknown>["format"]>;

const numberFormats: Partial<Record<XlsxFormat, string>> = {
  peso: '"₱"#,##0.00',
  date: "mmm d, yyyy",
  month: "mmmm yyyy",
  percent: "0.0%",
};

function cellValue(value: string | number, format?: XlsxFormat) {
  // Date-only values become UTC midnight so Excel shows the same calendar day in any time zone.
  if (format === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00Z`);
  if (format === "month" && typeof value === "string" && /^\d{4}-\d{2}$/.test(value)) return new Date(`${value}-01T00:00:00Z`);
  return value;
}

/** Builds a one-sheet .xlsx in the browser and downloads it. exceljs is loaded only when a report is exported. */
export async function exportXlsx<Row>({ filename, sheetName, columns, rows }: { filename: string; sheetName: string; columns: XlsxColumn<Row>[]; rows: Row[] }) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "G4 Builders Inc";
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });

  sheet.columns = columns.map((column) => ({
    header: column.header,
    width: column.width,
    style: {
      ...(column.format && numberFormats[column.format] ? { numFmt: numberFormats[column.format] } : {}),
      ...(column.format === "date" || column.format === "month" ? { alignment: { horizontal: "left" as const } } : {}),
    },
  }));
  for (const row of rows) sheet.addRow(columns.map((column) => cellValue(column.value(row), column.format)));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB91C1C" } };
  header.alignment = { vertical: "middle" };
  header.height = 20;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
