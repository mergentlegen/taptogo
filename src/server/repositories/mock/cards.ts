import type { Card } from "@/features/cards/schemas";
import { serviceError } from "@/server/i18n";

import type { CardBatchRepository, CardFilter, CardRepository } from "../cards";
import {
  applyPatch,
  clone,
  cloneOrNull,
  inScope,
  newestFirst,
  requireRow,
  type MockContext,
} from "./context";

export function mockCardBatchRepository({ db, clock, newId }: MockContext): CardBatchRepository {
  return {
    async findById(id) {
      return cloneOrNull(db.batches.find((b) => b.id === id));
    },
    async list() {
      return clone(newestFirst([...db.batches]));
    },
    async createWithCards(batchInput, cardInputs) {
      // Validate everything first: a conflict must leave no trace (one transaction).
      const taken = new Set(db.cards.map((c) => c.code));
      for (const input of cardInputs) {
        if (taken.has(input.code)) throw serviceError("CONFLICT", "cardCodeTaken");
        taken.add(input.code);
      }
      const createdAt = clock().toISOString();
      const batch = { ...clone(batchInput), id: newId(), createdAt };
      const cards: Card[] = cardInputs.map((input, index) => ({
        ...clone(input),
        id: newId(),
        batchId: batch.id,
        number: index + 1,
        createdAt,
      }));
      db.batches.push(batch);
      db.cards.push(...cards);
      return { batch: clone(batch), cards: clone(cards) };
    },
    async progress() {
      const result: Record<string, { assigned: number; written: number; locked: number }> = {};
      for (const card of db.cards) {
        const row = (result[card.batchId] ??= { assigned: 0, written: 0, locked: 0 });
        if (card.status !== "UNASSIGNED") row.assigned++;
        if (card.nfcWritten) row.written++;
        if (card.nfcLocked) row.locked++;
      }
      return result;
    },
  };
}

function matches(card: Card, filter: CardFilter): boolean {
  const search = filter.search?.trim();
  return (
    (!filter.organizationId || card.organizationId === filter.organizationId) &&
    (!filter.batchId || card.batchId === filter.batchId) &&
    (!filter.locationId || card.locationId === filter.locationId) &&
    (!filter.employeeId || card.employeeId === filter.employeeId) &&
    (!filter.targetId || card.targetId === filter.targetId) &&
    (!filter.statuses || filter.statuses.includes(card.status)) &&
    (!filter.numbers || (card.number >= filter.numbers.from && card.number <= filter.numbers.to)) &&
    (!search || card.code.startsWith(search) || card.label.toLowerCase().includes(search.toLowerCase()))
  );
}

export function mockCardRepository({ db }: MockContext): CardRepository {
  const find = (id: string, scope?: { organizationId: string }) =>
    db.cards.find((c) => c.id === id && inScope(c, scope));
  const batchOrder = () => new Map(db.batches.map((b) => [b.id, b.createdAt]));
  /** Same order the SQL implementation uses: batch creation, then number. */
  const ordered = (cards: Card[]) => {
    const order = batchOrder();
    return cards.sort(
      (a, b) =>
        (order.get(a.batchId) ?? "").localeCompare(order.get(b.batchId) ?? "") ||
        a.batchId.localeCompare(b.batchId) ||
        a.number - b.number,
    );
  };

  return {
    async findById(id, scope) {
      return cloneOrNull(find(id, scope));
    },
    async findByIds(ids) {
      const wanted = new Set(ids);
      return clone(db.cards.filter((c) => wanted.has(c.id)));
    },
    async findByCode(code) {
      return cloneOrNull(db.cards.find((c) => c.code === code));
    },
    async findByCodes(codes) {
      const wanted = new Set(codes);
      return clone(db.cards.filter((c) => wanted.has(c.code)));
    },
    async list(filter = {}) {
      return clone(ordered(db.cards.filter((c) => matches(c, filter))));
    },
    async search(filter, limit) {
      const all = ordered(db.cards.filter((c) => matches(c, filter)));
      return { items: clone(all.slice(0, limit)), total: all.length };
    },
    async count(filter = {}) {
      return db.cards.filter((c) => matches(c, filter)).length;
    },
    async countBy(dimension, filter = {}) {
      const counts: Record<string, number> = {};
      for (const card of db.cards) {
        const key = card[dimension];
        if (key === null || !matches(card, filter)) continue;
        counts[key] = (counts[key] ?? 0) + 1;
      }
      return counts;
    },
    async listIdle({ activatedBefore, noTapsSince, limit }) {
      const tapped = new Set(
        db.dailyStats.filter((s) => s.date >= noTapsSince && s.taps > 0).map((s) => s.cardId),
      );
      return clone(
        ordered(
          db.cards.filter(
            (c) =>
              c.status === "ACTIVE" &&
              c.organizationId !== null &&
              c.activatedAt !== null &&
              c.activatedAt < activatedBefore &&
              !tapped.has(c.id),
          ),
        ).slice(0, limit),
      );
    },
    async update(id, patch, scope) {
      return clone(applyPatch(requireRow(find(id, scope), "Card"), patch));
    },
    async updateMany(ids, patch) {
      const rows = ids.map((id) => requireRow(find(id), "Card"));
      return clone(rows.map((row) => applyPatch(row, patch)));
    },
    async assign(input) {
      // Single-threaded JS: checks and writes below cannot interleave with another call.
      const rows = input.cardIds.map((id) => find(id));
      if (rows.some((row) => !row)) return { ok: false, reason: "NOT_FOUND" };
      const cards = rows.filter((row): row is Card => row !== undefined);
      if (cards.some((c) => c.status !== "UNASSIGNED")) return { ok: false, reason: "NOT_UNASSIGNED" };
      if (input.cardLimit !== null) {
        const held = db.cards.filter(
          (c) => c.organizationId === input.organizationId && c.status !== "REVOKED",
        ).length;
        if (held + cards.length > input.cardLimit) return { ok: false, reason: "LIMIT_EXCEEDED" };
      }
      for (const card of cards) {
        applyPatch(card, {
          organizationId: input.organizationId,
          locationId: input.locationId,
          employeeId: null,
          targetId: input.targetId,
          status: "ACTIVE",
          activatedAt: input.activatedAt,
        });
      }
      return { ok: true, cards: clone(cards) };
    },
  };
}
