import { describe, expect, it } from "vitest";

import { landingPreviewData } from "./preview-data";

describe("landing dashboard preview", () => {
  it("is deterministic and ends today", () => {
    const a = landingPreviewData("2026-10-17");
    expect(landingPreviewData("2026-10-17")).toEqual(a);
    expect(a.daily).toHaveLength(30);
    expect(a.daily.at(-1)?.date).toBe("2026-10-17");
    expect(a.daily[0]?.date).toBe("2026-09-18");
  });

  it("keeps the headline numbers consistent with the chart", () => {
    const data = landingPreviewData("2026-10-17");
    expect(data.taps.current).toBe(data.daily.reduce((sum, d) => sum + d.taps, 0));
    expect(data.perDay).toBe(Math.round(data.taps.current / 30));
    expect(data.daily.every((d) => d.taps > 0)).toBe(true);
  });

  it("shows no rating, review or conversion figures (they need the 2GIS API)", () => {
    expect(Object.keys(landingPreviewData("2026-10-17")).sort()).toEqual([
      "daily",
      "perDay",
      "taps",
      "topEmployees",
    ]);
  });
});
