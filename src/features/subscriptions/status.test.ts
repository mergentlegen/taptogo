import { describe, expect, it } from "vitest";

import { canViewStatistics, resolveSubscriptionStatus } from "./status";

const paid = { paidUntil: "2026-10-31", status: "ACTIVE" } as const;
const trial = { paidUntil: "2026-10-31", status: "TRIAL" } as const;

describe("resolveSubscriptionStatus", () => {
  it("is active through the last paid day", () => {
    expect(resolveSubscriptionStatus(paid, "2026-10-31", 7)).toBe("ACTIVE");
  });

  it("enters grace the day after and stays there for graceDays", () => {
    expect(resolveSubscriptionStatus(paid, "2026-11-01", 7)).toBe("GRACE");
    expect(resolveSubscriptionStatus(paid, "2026-11-07", 7)).toBe("GRACE");
    expect(resolveSubscriptionStatus(paid, "2026-11-08", 7)).toBe("EXPIRED");
  });

  it("ignores a stale stored status", () => {
    expect(resolveSubscriptionStatus({ ...paid, status: "EXPIRED" }, "2026-10-01", 7)).toBe("ACTIVE");
  });

  it("ends trials without grace", () => {
    expect(resolveSubscriptionStatus(trial, "2026-10-31", 7)).toBe("TRIAL");
    expect(resolveSubscriptionStatus(trial, "2026-11-01", 7)).toBe("EXPIRED");
  });

  it("supports zero grace days", () => {
    expect(resolveSubscriptionStatus(paid, "2026-11-01", 0)).toBe("EXPIRED");
  });
});

describe("canViewStatistics", () => {
  it("hides statistics only when expired", () => {
    expect(canViewStatistics("GRACE")).toBe(true);
    expect(canViewStatistics("EXPIRED")).toBe(false);
  });
});
