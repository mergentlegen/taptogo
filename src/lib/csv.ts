/** Byte-order mark: tells Excel the file is UTF-8. */
const BOM = String.fromCharCode(0xfeff);

export type CellValue = string | number | null;

/** Characters that make spreadsheet apps treat a cell as a formula. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * Neutralizes CSV/formula injection: a text value starting with = + - @ tab
 * or CR gets a leading apostrophe, so Excel shows it as text instead of
 * executing it. Real numbers are left alone.
 */
export function sanitizeCell(value: CellValue): CellValue {
  if (typeof value !== "string") return value;
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value;
}

function quote(value: CellValue, separator: string): string {
  if (value === null) return "";
  const text = String(sanitizeCell(value));
  return /["\n\r]/.test(text) || text.includes(separator) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Semicolon-separated with a UTF-8 BOM: what Excel with Russian regional
 * settings opens correctly by double-click.
 */
export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly CellValue[])[],
  separator = ";",
): string {
  const lines = [headers, ...rows].map((row) => row.map((cell) => quote(cell, separator)).join(separator));
  return `${BOM}${lines.join("\r\n")}\r\n`;
}
