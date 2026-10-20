import { describe, expect, it } from "vitest";

import { analyzeVisit, parseSeenCookie, serializeSeenCookie } from "./visitor-cookie";

const TZ = "Asia/Almaty";
const at = (iso: string) => new Date(iso);

function visit(cookie: string | undefined, iso: string, code = "AbCd1234") {
  return analyzeVisit({ cookie, code, now: at(iso), timeZone: TZ });
}

describe("analyzeVisit", () => {
  it("treats the first tap as unique and not a duplicate", () => {
    expect(visit(undefined, "2026-10-17T07:00:00Z")).toMatchObject({
      isDuplicate: false,
      isNewVisitorToday: true,
    });
  });

  it("flags a repeat within 30 minutes as a duplicate", () => {
    const first = visit(undefined, "2026-10-17T07:00:00Z");
    const repeat = visit(first.cookieValue, "2026-10-17T07:29:00Z");

    expect(repeat).toMatchObject({ isDuplicate: true, isNewVisitorToday: false });
  });

  it("counts a later tap the same day as valid but not as a new visitor", () => {
    const first = visit(undefined, "2026-10-17T07:00:00Z");
    expect(visit(first.cookieValue, "2026-10-17T07:31:00Z")).toMatchObject({
      isDuplicate: false,
      isNewVisitorToday: false,
    });
  });

  it("counts the visitor again on the next local day", () => {
    // 18:50 UTC = 23:50 in Almaty; 19:30 UTC = 00:30 the next day.
    const late = visit(undefined, "2026-10-17T18:50:00Z");
    expect(visit(late.cookieValue, "2026-10-17T19:30:00Z")).toMatchObject({
      isDuplicate: false,
      isNewVisitorToday: true,
    });
  });

  it("tracks cards independently", () => {
    const first = visit(undefined, "2026-10-17T07:00:00Z", "AbCd1234");
    expect(visit(first.cookieValue, "2026-10-17T07:01:00Z", "ZzZz9999")).toMatchObject({
      isDuplicate: false,
      isNewVisitorToday: true,
    });
  });

  it("does not extend the duplicate window on repeats", () => {
    const first = visit(undefined, "2026-10-17T07:00:00Z");
    const repeat = visit(first.cookieValue, "2026-10-17T07:20:00Z");
    expect(visit(repeat.cookieValue, "2026-10-17T07:31:00Z").isDuplicate).toBe(false);
  });
});

describe("seen cookie format", () => {
  it("round-trips and contains only card codes and times", () => {
    const value = serializeSeenCookie(new Map([["AbCd1234", 29_000_000]]));
    expect(value).toMatch(/^AbCd1234\.[0-9a-z]+$/);
    expect(parseSeenCookie(value).get("AbCd1234")).toBe(29_000_000);
  });

  it("ignores garbage and oversized values", () => {
    expect(parseSeenCookie("<script>|x.y|AbCd1234.!!").size).toBe(0);
    expect(parseSeenCookie("A".repeat(5000)).size).toBe(0);
  });

  it("keeps at most 20 most recent cards", () => {
    let cookie: string | undefined;
    for (let i = 0; i < 30; i++) {
      cookie = analyzeVisit({
        cookie,
        code: `Card${String(i).padStart(4, "0")}`,
        now: new Date(Date.UTC(2026, 9, 17, 7, i)),
        timeZone: TZ,
      }).cookieValue;
    }
    const seen = parseSeenCookie(cookie);
    expect(seen.size).toBe(20);
    expect(seen.has("Card0029")).toBe(true);
    expect(seen.has("Card0000")).toBe(false);
  });
});
