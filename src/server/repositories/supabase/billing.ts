import "server-only";

import { paymentSchema, subscriptionSchema } from "@/features/subscriptions/schemas";

import type { PaymentRepository, SubscriptionRepository } from "../billing";
import { fromRow, fromRows, ok, one, readAll, rows, toRow, type DbGetter } from "./support";

export function supabaseSubscriptionRepository(db: DbGetter): SubscriptionRepository {
  return {
    async findByOrganization(organizationId) {
      const c = await db();
      const data = ok(
        await c.from("subscriptions").select("*").eq("organization_id", organizationId).maybeSingle(),
      );
      return data ? fromRow(subscriptionSchema, data) : null;
    },
    async list() {
      const c = await db();
      const data = await readAll((from, to) =>
        c.from("subscriptions").select("*").order("organization_id").range(from, to),
      );
      return fromRows(subscriptionSchema, data);
    },
    async upsert(subscription) {
      const c = await db();
      const data = one(
        await c
          .from("subscriptions")
          .upsert(toRow(subscription), { onConflict: "organization_id" })
          .select()
          .single(),
      );
      return fromRow(subscriptionSchema, data);
    },
  };
}

export function supabasePaymentRepository(db: DbGetter): PaymentRepository {
  return {
    async list({ organizationId, range, limit }) {
      const c = await db();
      let query = c.from("payments").select("*");
      if (organizationId) query = query.eq("organization_id", organizationId);
      if (range) query = query.gte("paid_at", range.from).lt("paid_at", range.to);
      const data = rows(await query.order("paid_at", { ascending: false }).order("id").limit(limit));
      return fromRows(paymentSchema, data);
    },
    async sum({ range }) {
      const c = await db();
      return one(await c.rpc("payments_sum", { p_from: range.from, p_to: range.to }));
    },
    async create(input) {
      const c = await db();
      return fromRow(paymentSchema, one(await c.from("payments").insert(toRow(input)).select().single()));
    },
  };
}
