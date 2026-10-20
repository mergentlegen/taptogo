import { describe, expect, it } from "vitest";

import { detectImageType } from "./image-type";

const bytes = (...values: number[]) => Uint8Array.from([...values, ...new Array(16).fill(0)]);

describe("detectImageType", () => {
  it("recognizes PNG, JPEG and WebP by content", () => {
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe("image/png");
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
    expect(detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))?.mime).toBe(
      "image/webp",
    );
  });

  it("rejects SVG, HTML and executables even if renamed", () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    expect(detectImageType(encode('<svg xmlns="http://www.w3.org/2000/svg"><script>'))).toBeNull();
    expect(detectImageType(encode("<!doctype html>"))).toBeNull();
    expect(detectImageType(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});
