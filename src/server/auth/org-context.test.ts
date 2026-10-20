import { describe, expect, it } from "vitest";

import { resolveActiveMembership } from "./org-context";

const memberships = [
  { organizationId: "coffee", role: "OWNER" as const },
  { organizationId: "carwash", role: "MANAGER" as const },
];

describe("resolveActiveMembership", () => {
  it("uses the cookie when the user is a member", () => {
    expect(resolveActiveMembership(memberships, "carwash")?.role).toBe("MANAGER");
  });

  it("ignores a cookie pointing to a foreign organization", () => {
    expect(resolveActiveMembership(memberships, "beauty")?.organizationId).toBe("coffee");
  });

  it("falls back to the first membership without a cookie", () => {
    expect(resolveActiveMembership(memberships, undefined)?.organizationId).toBe("coffee");
  });

  it("returns null for users without memberships", () => {
    expect(resolveActiveMembership([], "coffee")).toBeNull();
  });
});
