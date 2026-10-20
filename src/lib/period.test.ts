import { describe, expect, it } from "vitest";

import { formatChange, formatIsoDate, formatRating } from "./format";
import { resolvePeriod } from "./period";

const TODAY = "2026-10-17";

describe("resolvePeriod", () => {
  it("defaults to the last 30 days including today", () => {
    expect(resolvePeriod({}, TODAY)).toEqual({
      preset: "30d",
      from: "2026-09-18",
      to: TODAY,
      days: 30,
      previous: { from: "2026-08-19", to: "2026-09-17" },
    });
  });

  it("supports today and 7 days", () => {
    expect(resolvePeriod({ period: "today" }, TODAY)).toMatchObject({ from: TODAY, to: TODAY, days: 1 });
    expect(resolvePeriod({ period: "7d" }, TODAY)).toMatchObject({
      from: "2026-10-11",
      previous: { from: "2026-10-04", to: "2026-10-10" },
    });
  });

  it("accepts a valid custom range", () => {
    expect(resolvePeriod({ period: "custom", from: "2026-10-01", to: "2026-10-10" }, TODAY)).toMatchObject({
      preset: "custom",
      days: 10,
      previous: { from: "2026-09-21", to: "2026-09-30" },
    });
  });

  it.each([
    { from: "2026-10-10", to: "2026-10-01" },
    { from: "2026-10-01", to: "2026-10-30" },
    { from: "2024-01-01", to: "2026-10-01" },
    { from: "garbage", to: "2026-10-01" },
  ])("falls back to the default for an invalid custom range %j", (range) => {
    expect(resolvePeriod({ period: "custom", ...range }, TODAY).preset).toBe("30d");
  });

  it("ignores unknown presets", () => {
    expect(resolvePeriod({ period: "forever" }, TODAY).preset).toBe("30d");
  });
});

describe("format helpers", () => {
  it("formats in Russian", () => {
    expect(formatRating(4.567)).toBe("4,6");
    expect(formatIsoDate("2026-10-17")).toMatch(/17 окт/);
    expect(formatChange(120, 100)).toMatch(/^\+20\s?%$/);
    expect(formatChange(5, 0)).toBeNull();
  });
});
