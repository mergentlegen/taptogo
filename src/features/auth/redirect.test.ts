import { describe, expect, it } from "vitest";

import { homePathFor, safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it.each([
    ["/app", "/app"],
    ["/app/cards?status=ACTIVE", "/app/cards?status=ACTIVE"],
    ["/admin/organizations", "/admin/organizations"],
  ])("keeps internal path %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.com",
    "//evil.com/app",
    "/\\evil.com",
    "javascript:alert(1)",
    "app",
    "/app\u0000",
    "",
    null,
    undefined,
  ])("rejects %j", (input) => {
    expect(safeNextPath(input)).toBeNull();
  });
});

describe("homePathFor", () => {
  it("sends staff to the admin panel and clients to the cabinet", () => {
    expect(homePathFor({ platformRole: "ADMIN" })).toBe("/admin");
    expect(homePathFor({ platformRole: null })).toBe("/app");
  });
});
