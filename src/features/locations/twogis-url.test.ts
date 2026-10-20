import { describe, expect, it } from "vitest";

import { parseTwogisFirmUrl, twogisProfileUrl, twogisReviewsUrl } from "./twogis-url";

describe("parseTwogisFirmUrl", () => {
  it("reads firm id and city from profile and review links", () => {
    const expected = { host: "2gis.kz", city: "almaty", firmId: "70000001012345678" };

    expect(parseTwogisFirmUrl("https://2gis.kz/almaty/firm/70000001012345678")).toEqual(expected);
    expect(parseTwogisFirmUrl("https://www.2gis.kz/almaty/firm/70000001012345678/tab/reviews?m=1")).toEqual(
      expected,
    );
  });

  it("builds canonical profile and review URLs", () => {
    const parsed = parseTwogisFirmUrl("https://2gis.ru/moscow/firm/4504127908123456/tab/info");
    expect(parsed).not.toBeNull();
    if (!parsed) return;

    expect(twogisProfileUrl(parsed)).toBe("https://2gis.ru/moscow/firm/4504127908123456");
    expect(twogisReviewsUrl(parsed)).toBe("https://2gis.ru/moscow/firm/4504127908123456/tab/reviews");
  });

  it.each([
    "http://2gis.kz/almaty/firm/70000001012345678",
    "https://evil.com/almaty/firm/70000001012345678",
    "https://2gis.kz/almaty/geo/70030076123456789",
    "https://go.2gis.com/abc12",
    "not a url",
  ])("returns null for %s", (url) => {
    expect(parseTwogisFirmUrl(url)).toBeNull();
  });
});
