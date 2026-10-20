import { describe, expect, it } from "vitest";

import { adminNavigation, appMobilePrimary, appNavigation, isNavItemActive } from "./navigation";

describe("isNavItemActive", () => {
  it("matches section roots exactly", () => {
    expect(isNavItemActive("/app", "/app")).toBe(true);
    expect(isNavItemActive("/app/cards", "/app")).toBe(false);
    expect(isNavItemActive("/admin/staff", "/admin")).toBe(false);
  });

  it("matches nested pages of regular items", () => {
    expect(isNavItemActive("/app/cards/abc", "/app/cards")).toBe(true);
    expect(isNavItemActive("/app/cards", "/app/cards")).toBe(true);
  });

  it("does not match routes that only share a prefix", () => {
    expect(isNavItemActive("/app/cardsets", "/app/cards")).toBe(false);
  });
});

describe("navigation config", () => {
  it("has unique keys and hrefs", () => {
    const adminItems = adminNavigation.flatMap((g) => g.items);
    for (const items of [appNavigation, adminItems]) {
      expect(new Set(items.map((i) => i.key)).size).toBe(items.length);
      expect(new Set(items.map((i) => i.href)).size).toBe(items.length);
    }
  });

  it("only references existing items in the mobile bar", () => {
    const keys = appNavigation.map((i) => i.key);
    expect(appMobilePrimary.every((k) => keys.includes(k))).toBe(true);
  });
});
