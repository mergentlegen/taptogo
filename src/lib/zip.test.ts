import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { crc32, createZip } from "./zip";

describe("crc32", () => {
  it("matches the standard check value", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe("createZip", () => {
  it("is readable by an independent zip library, compressed or stored", async () => {
    const big = "<svg>".padEnd(5000, "QR ");
    const bytes = await createZip([
      { name: "codes.csv", data: "number,code\r\n1,AbCd1234\r\n" },
      { name: "qr/0001-AbCd1234.svg", data: big },
      { name: "empty.txt", data: "" },
      { name: "бинарный.bin", data: new Uint8Array([0, 1, 2, 255, 254]) },
    ]);

    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    expect(Object.keys(zip.files).sort()).toEqual([
      "codes.csv",
      "empty.txt",
      "qr/0001-AbCd1234.svg",
      "бинарный.bin",
    ]);
    expect(await zip.file("codes.csv")!.async("string")).toBe("number,code\r\n1,AbCd1234\r\n");
    expect(await zip.file("qr/0001-AbCd1234.svg")!.async("string")).toBe(big);
    expect(await zip.file("empty.txt")!.async("string")).toBe("");
    expect([...(await zip.file("бинарный.bin")!.async("uint8array"))]).toEqual([0, 1, 2, 255, 254]);
  });

  it("really compresses what is worth compressing", async () => {
    const text = "<path d='M0 0h10v10H0z'/>".repeat(400);
    const bytes = await createZip([{ name: "a.svg", data: text }]);

    expect(bytes.length).toBeLessThan(text.length / 5);
  });

  it("writes an empty archive", async () => {
    const zip = await JSZip.loadAsync(await createZip([]));
    expect(Object.keys(zip.files)).toEqual([]);
  });

  it("handles a few thousand files, like a full batch", async () => {
    const files = Array.from({ length: 2000 }, (_, i) => ({
      name: `qr/${i}.svg`,
      data: `<svg>${i}</svg>`.repeat(20),
    }));
    const zip = await JSZip.loadAsync(await createZip(files), { checkCRC32: true });

    expect(Object.keys(zip.files).filter((n) => n.endsWith(".svg"))).toHaveLength(2000);
    expect(await zip.file("qr/1999.svg")!.async("string")).toBe("<svg>1999</svg>".repeat(20));
  });
});
