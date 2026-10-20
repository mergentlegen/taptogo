import { cardStatuses } from "@/features/cards/schemas";
import type { Plan, SubscriptionStatus } from "@/features/subscriptions/schemas";
import { canViewStatistics, resolveSubscriptionStatus } from "@/features/subscriptions/status";
import { toLocalDate, type IsoDate } from "@/lib/dates";
import type { Repositories } from "@/server/repositories";
import { forOrganization } from "@/server/repositories/tenant";

import type { OrgContext } from "./context";

export type SubscriptionView = {
  plan: Plan | null;
  cardLimit: number;
  cardsUsed: number;
  paidUntil: IsoDate | null;
  status: SubscriptionStatus;
  monthlyPriceKzt: number | null;
  /** Statistics are hidden (blurred) once the subscription has expired. */
  statsAllowed: boolean;
};

export class SubscriptionService {
  constructor(
    private readonly repositories: Repositories,
    private readonly clock: () => Date,
  ) {}

  async view(ctx: OrgContext): Promise<SubscriptionView> {
    const repos = forOrganization(this.repositories, ctx.organizationId);
    const [subscription, settings, cardsUsed] = await Promise.all([
      repos.subscription(),
      repos.platformSettings(),
      repos.cards.count({ statuses: cardStatuses.filter((s) => s !== "REVOKED") }),
    ]);
    if (!subscription) {
      return {
        plan: null,
        cardLimit: 0,
        cardsUsed,
        paidUntil: null,
        status: "EXPIRED",
        monthlyPriceKzt: null,
        statsAllowed: false,
      };
    }

    const today = toLocalDate(this.clock(), ctx.timeZone);
    const status = resolveSubscriptionStatus(subscription, today, settings.graceDays);
    return {
      plan: subscription.plan,
      cardLimit: subscription.cardLimit,
      cardsUsed,
      paidUntil: subscription.paidUntil,
      status,
      monthlyPriceKzt: settings.plans.find((p) => p.plan === subscription.plan)?.monthlyPriceKzt ?? null,
      statsAllowed: canViewStatistics(status),
    };
  }
}
