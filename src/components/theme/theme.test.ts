import { describe, expect, it } from "vitest";

import { parseTheme } from "./theme";

describe("parseTheme", () => {
  it("accepts known themes", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
  });

  it("falls back to system for missing or tampered cookies", () => {
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("<script>")).toBe("system");
  });
});
