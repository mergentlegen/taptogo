import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  diffInDays,
  eachDate,
  isoWeekday,
  localHourAndWeekday,
  toLocalDate,
  zonedTimeToUtc,
} from "./dates";

describe("dates", () => {
  it("resolves the local calendar date in Almaty (UTC+5)", () => {
    expect(toLocalDate("2026-10-16T18:59:00Z", "Asia/Almaty")).toBe("2026-10-16");
    expect(toLocalDate("2026-10-16T19:00:00Z", "Asia/Almaty")).toBe("2026-10-17");
  });

  it("converts local wall-clock time to UTC and back", () => {
    const instant = zonedTimeToUtc("2026-10-17", { hour: 13, minute: 30 }, "Asia/Almaty");

    expect(instant.toISOString()).toBe("2026-10-17T08:30:00.000Z");
    expect(localHourAndWeekday(instant, "Asia/Almaty")).toEqual({ hour: 13, weekday: 6 });
  });

  it("does calendar arithmetic across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffInDays("2026-11-01", "2026-10-17")).toBe(15);
    expect(eachDate("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });

  it("numbers weekdays from Monday", () => {
    expect(isoWeekday("2026-10-19")).toBe(1);
    expect(isoWeekday("2026-10-18")).toBe(7);
  });
});

describe("addMonths", () => {
  it("adds months and clamps to the end of shorter months", () => {
    expect(addMonths("2026-10-17", 1)).toBe("2026-11-17");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });
});
