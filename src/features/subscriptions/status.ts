import { addDays, type IsoDate } from "@/lib/dates";

import type { Subscription, SubscriptionStatus } from "./schemas";

/**
 * Effective status on `today` (organization-local date):
 *   paid period            → ACTIVE (or TRIAL while a trial lasts)
 *   up to graceDays after  → GRACE (paid subscriptions only)
 *   later                  → EXPIRED
 */
export function resolveSubscriptionStatus(
  subscription: Pick<Subscription, "paidUntil" | "status">,
  today: IsoDate,
  graceDays: number,
): SubscriptionStatus {
  const isTrial = subscription.status === "TRIAL";
  if (today <= subscription.paidUntil) return isTrial ? "TRIAL" : "ACTIVE";
  if (!isTrial && today <= addDays(subscription.paidUntil, graceDays)) return "GRACE";
  return "EXPIRED";
}

/** Whether the client cabinet may show statistics (it is blurred once expired). */
export function canViewStatistics(status: SubscriptionStatus): boolean {
  return status !== "EXPIRED";
}
