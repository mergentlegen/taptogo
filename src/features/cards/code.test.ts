import { describe, expect, it } from "vitest";

import { CARD_CODE_ALPHABET, generateCardCode, generateUniqueCardCodes, isCardCode } from "./code";

describe("generateCardCode", () => {
  it("produces 8 base62 characters", () => {
    for (let i = 0; i < 200; i++) {
      expect(isCardCode(generateCardCode())).toBe(true);
    }
  });

  it("discards biased bytes instead of folding them with modulo", () => {
    // 248..255 must be skipped; 0 and 61 map to the first and last symbol.
    const bytes = [255, 248, 0, 61, 0, 61, 0, 61, 0, 61];
    const code = generateCardCode((n) => Uint8Array.from({ length: n }, (_, i) => bytes[i] ?? 0));

    expect(code).toBe("0z0z0z0z");
  });

  it("covers the whole alphabet", () => {
    const seen = new Set(Array.from({ length: 400 }, () => generateCardCode()).join(""));
    expect(seen.size).toBe(CARD_CODE_ALPHABET.length);
  });
});

describe("generateUniqueCardCodes", () => {
  it("never returns taken or repeated codes", () => {
    const taken = new Set(["AAAAAAAA"]);
    const codes = generateUniqueCardCodes(500, taken);

    expect(new Set(codes).size).toBe(500);
    expect(codes).not.toContain("AAAAAAAA");
  });
});

describe("isCardCode", () => {
  it.each(["abc", "abcdefghi", "abcd-efg", "абвгдежз", "        "])("rejects %j", (value) => {
    expect(isCardCode(value)).toBe(false);
  });
});
