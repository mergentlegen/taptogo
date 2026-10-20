import { describe, expect, it } from "vitest";

import { checkTargetUrl } from "./url-policy";

const allowlist = ["2gis.kz", "2gis.ru", "go.2gis.com", "google.com", "maps.app.goo.gl", "g.page"];

describe("checkTargetUrl", () => {
  it.each([
    "https://2gis.kz/almaty/firm/70000001012345678/tab/reviews",
    "https://go.2gis.com/abc12",
    "https://www.google.com/maps/place/x",
    "https://maps.app.goo.gl/AbCdEf",
    "https://g.page/r/xyz/review",
    "https://2GIS.KZ/almaty",
  ])("accepts %s", (url) => {
    expect(checkTargetUrl(url, allowlist)).toMatchObject({ ok: true });
  });

  it("rejects plain http", () => {
    expect(checkTargetUrl("http://2gis.kz/almaty", allowlist)).toEqual({ ok: false, reason: "NOT_HTTPS" });
  });

  it.each([
    "https://evil.com/2gis.kz",
    "https://2gis.kz.evil.com/",
    "https://sites.google.com/view/phishing",
    "https://evil2gis.kz/",
  ])("rejects look-alike or user-content host %s", (url) => {
    expect(checkTargetUrl(url, allowlist)).toEqual({ ok: false, reason: "DOMAIN_NOT_ALLOWED" });
  });

  it("rejects embedded credentials", () => {
    expect(checkTargetUrl("https://user:pass@2gis.kz/", allowlist)).toEqual({
      ok: false,
      reason: "HAS_CREDENTIALS",
    });
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "not a url", ""])("rejects %s", (url) => {
    expect(checkTargetUrl(url, allowlist).ok).toBe(false);
  });
});
