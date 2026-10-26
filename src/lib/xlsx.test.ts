import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { createXlsx } from "./xlsx";

async function parts(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const read = (name: string) => zip.file(name)!.async("string");
  return { zip, sheet: await read("xl/worksheets/sheet1.xml"), workbook: await read("xl/workbook.xml") };
}

describe("createXlsx", () => {
  it("writes a zip with the parts of a workbook", async () => {
    const { zip } = await parts(
      await createXlsx({ sheet: "Дни", headers: ["Дата", "Касания"], rows: [["2026-10-01", 5]] }),
    );

    expect(Object.keys(zip.files).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/workbook.xml",
      "xl/worksheets/sheet1.xml",
    ]);
  });

  it("stores text as text, numbers as numbers and keeps empty cells empty", async () => {
    const { sheet, workbook } = await parts(
      await createXlsx({
        sheet: "Карточки",
        headers: ["Имя", "Число"],
        rows: [
          ["Касса", 12],
          [null, 0.5],
        ],
      }),
    );

    expect(workbook).toContain('name="Карточки"');
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr">');
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">Касса</t></is></c>');
    expect(sheet).toContain('<c r="B2"><v>12</v></c>');
    expect(sheet).toContain('<c r="B3"><v>0.5</v></c>');
    expect(sheet).not.toContain('r="A3"');
    expect(sheet).toContain('<pane ySplit="1"');
  });

  it("escapes markup and drops characters XML cannot hold", async () => {
    const { sheet } = await parts(
      await createXlsx({ sheet: "x", headers: ["<b>&"], rows: [['"q" \u0000 \u0007 ok']] }),
    );

    expect(sheet).toContain("&lt;b&gt;&amp;");
    expect(sheet).toContain("&quot;q&quot;   ok");
    expect(sheet).not.toMatch(/[\u0000-\u0008]/);
  });

  it("never turns a value into a formula", async () => {
    const { sheet } = await parts(await createXlsx({ sheet: "x", headers: ["h"], rows: [["=1+1"]] }));

    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("=1+1</t>");
  });

  it("makes a valid sheet name and addresses columns past Z", async () => {
    const wide = Array.from({ length: 28 }, (_, i) => `c${i}`);
    const { sheet, workbook } = await parts(
      await createXlsx({ sheet: "a/b[c]:d*?" + "x".repeat(40), headers: wide, rows: [] }),
    );

    expect(workbook).toMatch(/name="a b c  d  x+"/);
    expect(/name="([^"]+)"/.exec(workbook)![1]!.length).toBeLessThanOrEqual(31);
    expect(sheet).toContain('r="AB1"');
    expect(sheet).toContain('<col min="1" max="28"');
  });
});
