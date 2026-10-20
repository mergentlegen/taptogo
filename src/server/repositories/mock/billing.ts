import type { PaymentRepository, SubscriptionRepository } from "../billing";
import { clone, cloneOrNull, type MockContext } from "./context";

export function mockSubscriptionRepository({ db }: MockContext): SubscriptionRepository {
  return {
    async findByOrganization(organizationId) {
      return cloneOrNull(db.subscriptions.find((s) => s.organizationId === organizationId));
    },
    async list() {
      return clone(db.subscriptions);
    },
    async upsert(subscription) {
      const index = db.subscriptions.findIndex((s) => s.organizationId === subscription.organizationId);
      const row = clone(subscription);
      if (index === -1) db.subscriptions.push(row);
      else db.subscriptions[index] = row;
      return clone(row);
    },
  };
}

export function mockPaymentRepository({ db, newId }: MockContext): PaymentRepository {
  return {
    async list({ organizationId, range, limit }) {
      return clone(
        db.payments
          .filter((p) => !organizationId || p.organizationId === organizationId)
          .filter((p) => !range || (p.paidAt >= range.from && p.paidAt < range.to))
          .sort((a, b) => b.paidAt.localeCompare(a.paidAt))
          .slice(0, limit),
      );
    },
    async sum({ range }) {
      return db.payments
        .filter((p) => p.paidAt >= range.from && p.paidAt < range.to)
        .reduce((total, p) => total + p.amountKzt, 0);
    },
    async create(input) {
      const payment = { ...clone(input), id: newId() };
      db.payments.push(payment);
      return clone(payment);
    },
  };
}
