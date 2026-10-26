import type { CellValue } from "./csv";
import { createZip, type ZipEntry } from "./zip";

/**
 * A small .xlsx writer: one sheet, a bold frozen header row, fixed column width.
 * Written by hand instead of a spreadsheet library because the library alone was
 * about a third of the server bundle, and the serverless host limits its size.
 * An .xlsx file is a zip of a few XML parts; text is stored inline, so there is no
 * shared-strings table, and nothing is ever interpreted as a formula.
 */

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const COLUMN_WIDTH = 18;
const MAX_SHEET_NAME = 31;

/** Characters XML 1.0 cannot carry at all. */
const ILLEGAL_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;

function escapeXml(text: string): string {
  return text
    .replace(ILLEGAL_XML, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Excel refuses sheet names with []:*?/\ or longer than 31 characters. */
function sheetName(name: string): string {
  const clean = name
    .replace(/[[\]:*?/\\]/g, " ")
    .trim()
    .slice(0, MAX_SHEET_NAME);
  return clean || "Sheet1";
}

/** 0 → A, 25 → Z, 26 → AA … */
function columnLetter(index: number): string {
  let letter = "";
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1)
    letter = String.fromCharCode(65 + (n % 26)) + letter;
  return letter;
}

function cell(value: CellValue, row: number, column: number, style?: number): string {
  const ref = `${columnLetter(column)}${row}`;
  const s = style === undefined ? "" : ` s="${style}"`;
  if (value === null || value === "") return style === undefined ? "" : `<c r="${ref}"${s}/>`;
  if (typeof value === "number") {
    return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : "";
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

export async function createXlsx(input: {
  sheet: string;
  headers: readonly string[];
  rows: readonly (readonly CellValue[])[];
}): Promise<Uint8Array<ArrayBuffer>> {
  const columns = Math.max(input.headers.length, ...input.rows.map((row) => row.length), 1);
  const lines = [input.headers, ...input.rows].map((values, index) => {
    const number = index + 1;
    const cells = values.map((value, column) => cell(value, number, column, index === 0 ? 1 : undefined));
    return `<row r="${number}">${cells.join("")}</row>`;
  });

  const sheet =
    `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols><col min="1" max="${columns}" width="${COLUMN_WIDTH}" customWidth="1"/></cols>` +
    `<sheetData>${lines.join("")}</sheetData></worksheet>`;

  // Style 0 = default, style 1 = bold (the header row).
  const styles =
    `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  const parts: ZipEntry[] = [];
  const add = (name: string, data: string) => parts.push({ name, data });
  add(
    "[Content_Types].xml",
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  );
  add(
    "_rels/.rels",
    `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  add(
    "xl/workbook.xml",
    `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets><sheet name="${escapeXml(sheetName(input.sheet))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  add(
    "xl/_rels/workbook.xml.rels",
    `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  add("xl/styles.xml", styles);
  add("xl/worksheets/sheet1.xml", sheet);

  return createZip(parts);
}
