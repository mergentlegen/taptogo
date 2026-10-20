import type { CardBatch } from "@/features/batches/schemas";
import type { Card, CardStatus } from "@/features/cards/schemas";

import type { NewEntity, OrgScope } from "./common";

export type NewCard = Omit<NewEntity<Card>, "batchId" | "number">;

export interface CardBatchRepository {
  findById(id: string): Promise<CardBatch | null>;
  /** Newest first. */
  list(): Promise<CardBatch[]>;
  /**
   * Creates the batch and its cards in ONE transaction, numbering cards 1…n in
   * the given order. Any code already in use → AppError CONFLICT and nothing is
   * written (the caller generates fresh codes and retries).
   */
  createWithCards(
    batch: NewEntity<CardBatch>,
    cards: readonly NewCard[],
  ): Promise<{ batch: CardBatch; cards: Card[] }>;
  /** Per batch: how many cards are assigned to clients, NFC-written and locked. */
  progress(): Promise<Record<string, { assigned: number; written: number; locked: number }>>;
}

export type CardFilter = {
  organizationId?: string;
  batchId?: string;
  locationId?: string;
  employeeId?: string;
  targetId?: string;
  statuses?: readonly CardStatus[];
  /** Positions within `batchId`, both inclusive. */
  numbers?: { from: number; to: number };
  /** Case-sensitive code prefix or case-insensitive label substring. */
  search?: string;
};

export type CardPatch = Partial<
  Pick<
    Card,
    | "organizationId"
    | "locationId"
    | "employeeId"
    | "targetId"
    | "label"
    | "status"
    | "nfcWritten"
    | "nfcLocked"
    | "activatedAt"
  >
>;

export type AssignCardsInput = {
  cardIds: readonly string[];
  organizationId: string;
  locationId: string | null;
  targetId: string | null;
  activatedAt: string;
  /** Cards the organization may hold (not REVOKED); null = no limit. */
  cardLimit: number | null;
};

export type AssignCardsResult =
  { ok: true; cards: Card[] } | { ok: false; reason: "NOT_FOUND" | "NOT_UNASSIGNED" | "LIMIT_EXCEEDED" };

/** Countable card dimensions (SQL `group by`). */
export type CardCountDimension = "organizationId" | "targetId" | "batchId";

export interface CardRepository {
  findById(id: string, scope?: OrgScope): Promise<Card | null>;
  /** Missing ids are simply absent from the result. One query, not one per id. */
  findByIds(ids: readonly string[]): Promise<Card[]>;
  /** Exact, case-sensitive match. Used by the /t/{code} redirect. */
  findByCode(code: string): Promise<Card | null>;
  /** Batch lookup for pasted code lists; missing codes are absent from the result. */
  findByCodes(codes: readonly string[]): Promise<Card[]>;
  /**
   * Every match, ordered by batch and number. Meant for one organization or one
   * batch (bounded by the plan limit / batch size); platform-wide screens use `search`.
   */
  list(filter?: CardFilter): Promise<Card[]>;
  /** Platform-wide search for the admin panel: at most `limit` rows plus the total count. */
  search(filter: CardFilter, limit: number): Promise<{ items: Card[]; total: number }>;
  count(filter?: CardFilter): Promise<number>;
  /** Number of cards per value of the dimension; null values are left out. */
  countBy(dimension: CardCountDimension, filter?: CardFilter): Promise<Record<string, number>>;
  /**
   * Active cards activated before `activatedBefore` with no valid tap since
   * `noTapsSince` (a local date) — the "call this client" list. At most `limit`.
   */
  listIdle(input: { activatedBefore: string; noTapsSince: string; limit: number }): Promise<Card[]>;
  update(id: string, patch: CardPatch, scope?: OrgScope): Promise<Card>;
  /** Applies the same patch to every id; fails without changes if any id is missing. */
  updateMany(ids: readonly string[], patch: CardPatch): Promise<Card[]>;
  /**
   * Hands UNASSIGNED cards to a client in ONE transaction: re-checks that every
   * card is still unassigned and that the client stays within `cardLimit`
   * (Supabase: `select … for update` inside an RPC). Concurrent assignments of
   * the same card cannot both succeed.
   */
  assign(input: AssignCardsInput): Promise<AssignCardsResult>;
}
