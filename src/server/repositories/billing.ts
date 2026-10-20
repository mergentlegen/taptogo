import type { Payment, Subscription } from "@/features/subscriptions/schemas";

import type { DateRange } from "./common";

export interface SubscriptionRepository {
  findByOrganization(organizationId: string): Promise<Subscription | null>;
  list(): Promise<Subscription[]>;
  /** One subscription per organization: inserts or replaces it. */
  upsert(subscription: Subscription): Promise<Subscription>;
}

export interface PaymentRepository {
  /** Newest first, at most `limit`. `range` compares paidAt (UTC). */
  list(filter: { organizationId?: string; range?: DateRange; limit: number }): Promise<Payment[]>;
  /** Sum of amounts in the range, e.g. revenue of the month. */
  sum(filter: { range: DateRange }): Promise<number>;
  create(input: Omit<Payment, "id">): Promise<Payment>;
}
