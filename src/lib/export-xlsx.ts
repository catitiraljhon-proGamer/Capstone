export type XlsxColumn<Row> = {
  header: string;
  width: number;
  value: (row: Row) => string | number;
  /** "peso" formats numbers as ₱1,234.56; "date" turns a YYYY-MM-DD string into a real Excel date. */
  format?: "text" | "peso" | "date";
};

const pesoFormat = '"₱"#,##0.00';
const dateFormat = "mmm d, yyyy";

/** Builds a one-sheet .xlsx in the browser and downloads it. exceljs is loaded only when a report is exported. */
export async function exportXlsx<Row>({ filename, sheetName, columns, rows }: { filename: string; sheetName: string; columns: XlsxColumn<Row>[]; rows: Row[] }) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "G4 Builders Inc";
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });

  sheet.columns = columns.map((column) => ({
    header: column.header,
    width: column.width,
    style: column.format === "peso" ? { numFmt: pesoFormat } : column.format === "date" ? { numFmt: dateFormat, alignment: { horizontal: "left" } } : {},
  }));
  for (const row of rows) {
    sheet.addRow(columns.map((column) => {
      const value = column.value(row);
      // Date-only values become UTC midnight so Excel shows the same calendar day in any time zone.
      return column.format === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : value;
    }));
  }

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
