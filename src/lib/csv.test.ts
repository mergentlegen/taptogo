import { describe, expect, it } from "vitest";

import { sanitizeCell, toCsv } from "./csv";

describe("sanitizeCell", () => {
  it.each(['=HYPERLINK("http://evil")', "+7 700", "-2+3", "@SUM(A1)", "\tcmd", "\rcmd"])(
    "neutralizes %j",
    (value) => {
      expect(sanitizeCell(value)).toBe(`'${value}`);
    },
  );

  it("keeps ordinary text and numbers", () => {
    expect(sanitizeCell("Касса")).toBe("Касса");
    expect(sanitizeCell(-5)).toBe(-5);
    expect(sanitizeCell(null)).toBeNull();
  });
});

describe("toCsv", () => {
  it("writes a BOM, semicolons and CRLF", () => {
    const csv = toCsv(["Дата", "Касания"], [["2026-10-17", 12]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe("Дата;Касания\r\n2026-10-17;12\r\n");
  });

  it("quotes separators, quotes and newlines", () => {
    const csv = toCsv(["a"], [['Стол; "VIP"\nзал']]);
    expect(csv).toContain('"Стол; ""VIP""\nзал"');
  });

  it("escapes formulas even inside quoted cells", () => {
    expect(toCsv(["a"], [["=1;2"]])).toContain(`"'=1;2"`);
  });
});
