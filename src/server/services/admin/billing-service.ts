import type { Payment, PaymentMethod, Plan, SubscriptionStatus } from "@/features/subscriptions/schemas";
import { resolveSubscriptionStatus } from "@/features/subscriptions/status";
import { addMonths, DEFAULT_TIME_ZONE, toLocalDate, zonedTimeToUtc, type IsoDate } from "@/lib/dates";
import { serviceError } from "@/server/i18n";
import type { Repositories } from "@/server/repositories";
import type { AuditService } from "@/server/services/audit-service";

import { assertAdmin, type AdminContext } from "./context";

/** The billing page lists recent payments; per-client history is on the client page. */
const PAYMENTS_SHOWN = 100;

export type SubscriptionRow = {
  organizationId: string;
  organization: string;
  plan: Plan;
  cardLimit: number;
  paidUntil: IsoDate;
  storedStatus: SubscriptionStatus;
  status: SubscriptionStatus;
  monthlyPriceKzt: number | null;
};

/**
 * Manual payments (no online payment in MVP). Recording a payment extends
 * paidUntil by N months from the later of today and the current paidUntil;
 * ACTIVE → GRACE → EXPIRED is always derived from dates.
 */
export class AdminBillingService {
  constructor(
    private readonly repositories: Repositories,
    private readonly audit: AuditService,
    private readonly clock: () => Date,
  ) {}

  private today(): IsoDate {
    return toLocalDate(this.clock(), DEFAULT_TIME_ZONE);
  }

  async overview(): Promise<{
    subscriptions: SubscriptionRow[];
    payments: (Payment & { organization: string })[];
  }> {
    const repos = this.repositories;
    const [subscriptions, payments, organizations, settings] = await Promise.all([
      repos.subscriptions.list(),
      repos.payments.list({ limit: PAYMENTS_SHOWN }),
      repos.organizations.list(),
      repos.platformSettings.get(),
    ]);
    const orgName = new Map(organizations.map((o) => [o.id, o.name]));
    const today = this.today();
    return {
      subscriptions: subscriptions
        .map((s) => ({
          organizationId: s.organizationId,
          organization: orgName.get(s.organizationId) ?? "—",
          plan: s.plan,
          cardLimit: s.cardLimit,
          paidUntil: s.paidUntil,
          storedStatus: s.status,
          status: resolveSubscriptionStatus(s, today, settings.graceDays),
          monthlyPriceKzt: settings.plans.find((p) => p.plan === s.plan)?.monthlyPriceKzt ?? null,
        }))
        .sort((a, b) => a.paidUntil.localeCompare(b.paidUntil)),
      payments: payments.map((p) => ({ ...p, organization: orgName.get(p.organizationId) ?? "—" })),
    };
  }

  async recordPayment(
    ctx: AdminContext,
    input: {
      organizationId: string;
      amountKzt: number;
      method: PaymentMethod;
      paidOn: IsoDate;
      months: number;
      comment: string | null;
    },
  ): Promise<{ payment: Payment; paidUntil: IsoDate }> {
    assertAdmin(ctx, "admin.manage");
    const repos = this.repositories;
    const subscription = await repos.subscriptions.findByOrganization(input.organizationId);
    if (!subscription) throw serviceError("NOT_FOUND", "organizationNotFound");

    const payment = await repos.payments.create({
      organizationId: input.organizationId,
      amountKzt: input.amountKzt,
      method: input.method,
      paidAt: zonedTimeToUtc(input.paidOn, { hour: 12 }, DEFAULT_TIME_ZONE).toISOString(),
      comment: input.comment,
      recordedById: ctx.userId,
    });
    // Extend from today if the subscription already lapsed, otherwise from its end.
    const today = this.today();
    const base = subscription.paidUntil > today ? subscription.paidUntil : today;
    const paidUntil = addMonths(base, input.months);
    await repos.subscriptions.upsert({ ...subscription, paidUntil, status: "ACTIVE" });

    await this.audit.record({
      actorUserId: ctx.userId,
      action: "payment.create",
      entityType: "payment",
      entityId: payment.id,
      organizationId: input.organizationId,
      after: { amountKzt: payment.amountKzt, method: payment.method, months: input.months },
    });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "subscription.extend",
      entityType: "subscription",
      entityId: input.organizationId,
      organizationId: input.organizationId,
      before: { paidUntil: subscription.paidUntil, status: subscription.status },
      after: { paidUntil, status: "ACTIVE" },
    });
    return { payment, paidUntil };
  }

  async updateSubscription(
    ctx: AdminContext,
    input: { organizationId: string; plan: Plan; cardLimit: number; paidUntil: IsoDate; trial: boolean },
  ): Promise<void> {
    assertAdmin(ctx, "admin.manage");
    const before = await this.repositories.subscriptions.findByOrganization(input.organizationId);
    if (!before) throw serviceError("NOT_FOUND", "organizationNotFound");
    const after = {
      organizationId: input.organizationId,
      plan: input.plan,
      cardLimit: input.cardLimit,
      paidUntil: input.paidUntil,
      status: input.trial ? ("TRIAL" as const) : ("ACTIVE" as const),
    };
    await this.repositories.subscriptions.upsert(after);
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "subscription.update",
      entityType: "subscription",
      entityId: input.organizationId,
      organizationId: input.organizationId,
      before: {
        plan: before.plan,
        cardLimit: before.cardLimit,
        paidUntil: before.paidUntil,
        status: before.status,
      },
      after,
    });
  }
}
