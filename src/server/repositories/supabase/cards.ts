import "server-only";

import { cardBatchSchema } from "@/features/batches/schemas";
import { cardSchema } from "@/features/cards/schemas";
import { notFoundError } from "@/server/i18n";

import type { CardBatchRepository, CardFilter, CardRepository } from "../cards";
import {
  chunk,
  escapeLike,
  fail,
  fromRow,
  fromRows,
  nullable,
  ok,
  one,
  quote,
  readAll,
  rows,
  toRow,
  type DbGetter,
} from "./support";

/** The few filter methods the card queries share (select, count and update builders all have them). */
interface Filterable {
  eq(column: string, value: string): this;
  in(column: string, values: string[]): this;
  gte(column: string, value: number): this;
  lte(column: string, value: number): this;
  or(filters: string): this;
}

function applyCardFilter<Q extends Filterable>(query: Q, filter: CardFilter): Q {
  let q = query;
  if (filter.organizationId) q = q.eq("organization_id", filter.organizationId);
  if (filter.batchId) q = q.eq("batch_id", filter.batchId);
  if (filter.locationId) q = q.eq("location_id", filter.locationId);
  if (filter.employeeId) q = q.eq("employee_id", filter.employeeId);
  if (filter.targetId) q = q.eq("target_id", filter.targetId);
  if (filter.statuses) q = q.in("status", [...filter.statuses]);
  if (filter.numbers) q = q.gte("number", filter.numbers.from).lte("number", filter.numbers.to);
  const search = filter.search?.trim();
  if (search) {
    const text = escapeLike(search);
    q = q.or(`code.like.${quote(`${text}%`)},label.ilike.${quote(`%${text}%`)}`);
  }
  return q;
}

export function supabaseCardBatchRepository(db: DbGetter): CardBatchRepository {
  return {
    async findById(id) {
      const c = await db();
      const data = ok(await c.from("card_batches").select("*").eq("id", id).maybeSingle());
      return data ? fromRow(cardBatchSchema, data) : null;
    },
    async list() {
      const c = await db();
      const data = await readAll((from, to) =>
        c
          .from("card_batches")
          .select("*")
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      );
      return fromRows(cardBatchSchema, data);
    },
    async createWithCards(batch, cards) {
      const c = await db();
      // The RPC creates the batch and all cards in one transaction; a taken code → 23505 → CONFLICT.
      // Card type, status and the NFC flags come from the batch and the column defaults.
      const batchId = one(
        await c.rpc("create_batch_with_cards", {
          p_name: batch.name,
          p_card_type: batch.cardType,
          p_notes: nullable(batch.notes),
          p_codes: cards.map((card) => card.code),
          p_labels: cards.map((card) => card.label),
        }),
        { conflict: "cardCodeTaken" },
      );
      const [created, stored] = await Promise.all([
        one(await c.from("card_batches").select("*").eq("id", batchId).single()),
        readAll((from, to) =>
          c.from("cards").select("*").eq("batch_id", batchId).order("number").range(from, to),
        ),
      ]);
      return { batch: fromRow(cardBatchSchema, created), cards: fromRows(cardSchema, stored) };
    },
    async update(id, patch) {
      const c = await db();
      const values = toRow(patch);
      const data = Object.keys(values).length
        ? ok(await c.from("card_batches").update(values).eq("id", id).select().maybeSingle())
        : ok(await c.from("card_batches").select("*").eq("id", id).maybeSingle());
      if (!data) throw notFoundError("CardBatch");
      return fromRow(cardBatchSchema, data);
    },
    async delete(id) {
      const c = await db();
      const outcome = one(await c.rpc("delete_batch", { p_batch_id: id }));
      return outcome === "OK" || outcome === "IN_USE" ? outcome : "NOT_FOUND";
    },
    async progress() {
      const c = await db();
      const result: Record<string, { assigned: number; written: number; locked: number }> = {};
      for (const row of rows(await c.rpc("batch_progress"))) {
        result[row.batch_id] = { assigned: row.assigned, written: row.written, locked: row.locked };
      }
      return result;
    },
  };
}

export function supabaseCardRepository(db: DbGetter): CardRepository {
  /** Same order as the mocks: batch creation (cards share the batch's timestamp), then number. */
  const ordered = <Q extends { order(column: string): Q }>(query: Q) =>
    query.order("created_at").order("batch_id").order("number");

  const findManyBy = async (column: "id" | "code", values: readonly string[]) => {
    const c = await db();
    const found = await Promise.all(
      chunk([...new Set(values)]).map(async (part) =>
        rows(await c.from("cards").select("*").in(column, part)),
      ),
    );
    return fromRows(cardSchema, found.flat());
  };

  return {
    async findById(id, scope) {
      const c = await db();
      let query = c.from("cards").select("*").eq("id", id);
      if (scope) query = query.eq("organization_id", scope.organizationId);
      const data = ok(await query.maybeSingle());
      return data ? fromRow(cardSchema, data) : null;
    },
    findByIds: (ids) => findManyBy("id", ids),
    async findByCode(code) {
      const c = await db();
      const data = ok(await c.from("cards").select("*").eq("code", code).maybeSingle());
      return data ? fromRow(cardSchema, data) : null;
    },
    findByCodes: (codes) => findManyBy("code", codes),
    async list(filter = {}) {
      const c = await db();
      const data = await readAll((from, to) =>
        ordered(applyCardFilter(c.from("cards").select("*"), filter)).range(from, to),
      );
      return fromRows(cardSchema, data);
    },
    async search(filter, limit) {
      const c = await db();
      const { data, error, count } = await ordered(
        applyCardFilter(c.from("cards").select("*", { count: "exact" }), filter),
      ).limit(limit);
      if (error) fail(error);
      return { items: fromRows(cardSchema, data ?? []), total: count ?? 0 };
    },
    async count(filter = {}) {
      const c = await db();
      const { error, count } = await applyCardFilter(
        c.from("cards").select("id", { count: "exact", head: true }),
        filter,
      );
      if (error) fail(error);
      return count ?? 0;
    },
    async countBy(dimension, filter = {}) {
      const c = await db();
      const data = rows(
        await c.rpc("card_counts", {
          p_dimension: dimension,
          p_organization_id: filter.organizationId,
          p_batch_id: filter.batchId,
          p_location_id: filter.locationId,
          p_employee_id: filter.employeeId,
          p_target_id: filter.targetId,
          p_statuses: filter.statuses ? [...filter.statuses] : undefined,
          p_number_from: filter.numbers?.from,
          p_number_to: filter.numbers?.to,
          p_search: filter.search?.trim() || undefined,
        }),
      );
      return Object.fromEntries(data.map((row) => [row.key, row.n]));
    },
    async listIdle({ activatedBefore, noTapsSince, limit }) {
      const c = await db();
      const data = rows(
        await c.rpc("idle_cards", {
          p_activated_before: activatedBefore,
          p_no_taps_since: noTapsSince,
          p_limit: limit,
        }),
      );
      return fromRows(cardSchema, data);
    },
    async update(id, patch, scope) {
      const c = await db();
      const values = toRow(patch);
      // An empty patch changes nothing; PostgREST rejects an empty update, so just read the row.
      let query = Object.keys(values).length
        ? c.from("cards").update(values).select()
        : c.from("cards").select("*");
      query = query.eq("id", id);
      if (scope) query = query.eq("organization_id", scope.organizationId);
      const data = ok(await query.maybeSingle());
      if (!data) throw notFoundError("Card");
      return fromRow(cardSchema, data);
    },
    async updateMany(ids, patch) {
      const unique = [...new Set(ids)];
      const existing = await findManyBy("id", unique);
      if (existing.length !== unique.length) throw notFoundError("Card");
      const values = toRow(patch);
      if (Object.keys(values).length === 0) return existing;

      // One request per chunk of ids (URL length). Existence was checked above, so a
      // failure in the middle is limited to a database error, not to a missing card.
      const c = await db();
      const updated = await Promise.all(
        chunk(unique).map(async (part) => rows(await c.from("cards").update(values).in("id", part).select())),
      );
      return fromRows(cardSchema, updated.flat());
    },
    async assign(input) {
      const c = await db();
      const outcome = one(
        await c.rpc("assign_cards", {
          p_card_ids: [...input.cardIds],
          p_organization_id: input.organizationId,
          p_location_id: nullable(input.locationId),
          p_target_id: nullable(input.targetId),
          p_activated_at: input.activatedAt,
        }),
      );
      if (outcome !== "OK") {
        return { ok: false, reason: outcome === "NOT_UNASSIGNED" ? "NOT_UNASSIGNED" : "NOT_FOUND" };
      }
      return { ok: true, cards: await findManyBy("id", input.cardIds) };
    },
  };
}
