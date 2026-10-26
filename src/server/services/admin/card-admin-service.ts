import JSZip from "jszip";

import { generateUniqueCardCodes } from "@/features/cards/code";
import type { Card, CardStatus, CardType } from "@/features/cards/schemas";
import { toCsv } from "@/lib/csv";
import { AppError } from "@/server/errors";
import { serverText, serviceError } from "@/server/i18n";
import type { CardFilter, Repositories } from "@/server/repositories";
import type { AuditEntry, AuditService } from "@/server/services/audit-service";

import { assertAdmin, type AdminContext } from "./context";

export type AdminCardRow = Card & {
  organization: string | null;
  location: string | null;
  batch: string;
};

/** The admin card list is a search: it shows this many matches and says how many there are. */
export const ADMIN_CARDS_SHOWN = 500;
/** A clash of fresh random codes is ~1e-9 per batch; retrying a couple of times is plenty. */
const CODE_ATTEMPTS = 3;

type UrlBuilder = (code: string, source: "nfc" | "qr") => string;
type QrSvg = (text: string) => Promise<string>;

export class AdminCardService {
  constructor(
    private readonly repositories: Repositories,
    private readonly audit: AuditService,
    private readonly cardUrl: UrlBuilder,
    private readonly qrSvg: QrSvg,
    private readonly clock: () => Date,
  ) {}

  /** Platform-wide card search; bounded however many cards the platform holds. */
  async search(
    filter: { search?: string; batchId?: string; organizationId?: string; status?: CardStatus } = {},
    limit = ADMIN_CARDS_SHOWN,
  ): Promise<{ items: AdminCardRow[]; total: number }> {
    const found = await this.repositories.cards.search(toCardFilter(filter), limit);
    return { items: await this.withNames(found.items), total: found.total };
  }

  /** Display names for a page of cards: one lookup per kind, only for the ids on the page. */
  private async withNames(cards: Card[]): Promise<AdminCardRow[]> {
    const repos = this.repositories;
    const [organizations, locations, batches] = await Promise.all([
      repos.organizations.listByIds([...new Set(cards.flatMap((c) => c.organizationId ?? []))]),
      repos.locations.list(),
      repos.batches.list(),
    ]);
    const orgName = new Map(organizations.map((o) => [o.id, o.name]));
    const locName = new Map(locations.map((l) => [l.id, l.name]));
    const batchName = new Map(batches.map((b) => [b.id, b.name]));
    return cards.map((card) => ({
      ...card,
      organization: card.organizationId ? (orgName.get(card.organizationId) ?? null) : null,
      location: card.locationId ? (locName.get(card.locationId) ?? null) : null,
      batch: batchName.get(card.batchId) ?? "—",
    }));
  }

  find(cardId: string): Promise<Card | null> {
    return this.repositories.cards.findById(cardId);
  }

  // ── Batches ─────────────────────────────────────────────────────────────

  async listBatches() {
    const [batches, progress] = await Promise.all([
      this.repositories.batches.list(),
      this.repositories.batches.progress(),
    ]);
    return batches.map((batch) => ({
      ...batch,
      ...(progress[batch.id] ?? { assigned: 0, written: 0, locked: 0 }),
    }));
  }

  async batchDetail(batchId: string) {
    const batch = await this.repositories.batches.findById(batchId);
    if (!batch) return null;
    // A batch is bounded by MAX_BATCH_QUANTITY, so listing it whole is safe.
    const cards = await this.withNames(await this.repositories.cards.list({ batchId }));
    return {
      batch,
      cards: cards.map((c) => ({
        ...c,
        url: this.cardUrl(c.code, "nfc"),
        qrUrl: this.cardUrl(c.code, "qr"),
      })),
    };
  }

  /**
   * Codes come from a CSPRNG; uniqueness is guaranteed by the storage (a unique
   * constraint), not by loading every existing code. The batch and its cards
   * are written in one transaction.
   */
  async createBatch(
    ctx: AdminContext,
    input: { name: string; quantity: number; cardType: CardType; notes: string | null },
  ) {
    assertAdmin(ctx, "admin.manage");
    for (let attempt = 1; ; attempt++) {
      const codes = generateUniqueCardCodes(input.quantity, new Set());
      try {
        const { batch } = await this.repositories.batches.createWithCards(
          input,
          codes.map((code, index) => ({
            code,
            organizationId: null,
            locationId: null,
            employeeId: null,
            targetId: null,
            label: serverText("defaultCardLabel", { number: index + 1 }),
            type: input.cardType,
            status: "UNASSIGNED",
            nfcWritten: false,
            nfcLocked: false,
            activatedAt: null,
          })),
        );
        await this.audit.record({
          actorUserId: ctx.userId,
          action: "batch.create",
          entityType: "batch",
          entityId: batch.id,
          after: { name: batch.name, quantity: input.quantity, cardType: input.cardType },
        });
        return batch;
      } catch (error) {
        const codeClash = error instanceof AppError && error.code === "CONFLICT";
        if (!codeClash || attempt >= CODE_ATTEMPTS) throw error;
      }
    }
  }

  /** CSV for the print shop: number, code, NFC URL, QR URL. */
  async exportBatchCsv(ctx: AdminContext, batchId: string) {
    const detail = await this.requireBatch(batchId);
    await this.recordExport(ctx, batchId, "csv");
    return {
      filename: `batch-${fileSlug(detail.batch)}.csv`,
      body: toCsv(
        ["number", "code", "url", "qr_url"],
        detail.cards.map((c) => [c.number, c.code, c.url, c.qrUrl]),
        ",",
      ),
    };
  }

  /** ZIP with the CSV and one SVG QR per card, ready for printing. */
  async exportBatchZip(ctx: AdminContext, batchId: string) {
    const detail = await this.requireBatch(batchId);
    const zip = new JSZip();
    zip.file(
      "codes.csv",
      toCsv(
        ["number", "code", "url", "qr_url"],
        detail.cards.map((c) => [c.number, c.code, c.url, c.qrUrl]),
        ",",
      ),
    );
    const folder = zip.folder("qr");
    for (const card of detail.cards) {
      folder?.file(`${String(card.number).padStart(4, "0")}-${card.code}.svg`, await this.qrSvg(card.qrUrl));
    }
    await this.recordExport(ctx, batchId, "zip");
    return {
      filename: `batch-${fileSlug(detail.batch)}.zip`,
      body: await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }),
    };
  }

  private async requireBatch(batchId: string) {
    const detail = await this.batchDetail(batchId);
    if (!detail) throw serviceError("NOT_FOUND", "batchNotFound");
    return detail;
  }

  private recordExport(ctx: AdminContext, batchId: string, format: string) {
    return this.audit.record({
      actorUserId: ctx.userId,
      action: "batch.export",
      entityType: "batch",
      entityId: batchId,
      after: { format },
    });
  }

  async setFlashState(
    ctx: AdminContext,
    cardId: string,
    state: { nfcWritten?: boolean; nfcLocked?: boolean },
  ) {
    assertAdmin(ctx, "admin.manage");
    const card = await this.repositories.cards.findById(cardId);
    if (!card) throw serviceError("NOT_FOUND", "cardNotFound");
    // A locked tag is necessarily written.
    const patch = { ...state, ...(state.nfcLocked ? { nfcWritten: true } : {}) };
    await this.repositories.cards.update(cardId, patch);
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "card.flash",
      entityType: "card",
      entityId: cardId,
      organizationId: card.organizationId,
      before: { nfcWritten: card.nfcWritten, nfcLocked: card.nfcLocked },
      after: patch,
    });
  }

  // ── Assignment and status ───────────────────────────────────────────────

  /** Resolves a selection to cards with one query: ids, pasted codes or a numbered batch range. */
  async resolveSelection(selection: {
    cardIds?: string[];
    codes?: string[];
    range?: { batchId: string; from: number; to: number };
  }): Promise<Card[]> {
    const repos = this.repositories;
    if (selection.range) {
      const { batchId, from, to } = selection.range;
      // Numbers are stored with the card, so a range means exactly the printed numbers.
      return repos.cards.list({ batchId, numbers: { from, to } });
    }
    if (selection.codes?.length) {
      const cards = await repos.cards.findByCodes(selection.codes);
      if (cards.length !== new Set(selection.codes).size) throw serviceError("VALIDATION", "cardsNotFound");
      return cards;
    }
    const ids = selection.cardIds ?? [];
    const cards = await repos.cards.findByIds(ids);
    if (cards.length !== new Set(ids).size) throw serviceError("VALIDATION", "cardsNotFound");
    return cards;
  }

  /**
   * Hands free cards to a client: they become ACTIVE and point to the
   * location's verified review page. The repository re-checks "still
   * unassigned" and the plan's card limit inside one transaction, so two
   * admins assigning the same card at once cannot both succeed.
   */
  async assign(ctx: AdminContext, cards: Card[], organizationId: string, locationId: string | null) {
    assertAdmin(ctx, "admin.manage");
    const repos = this.repositories;
    if (cards.length === 0) throw serviceError("VALIDATION", "cardsNotFound");
    if (cards.some((c) => c.status !== "UNASSIGNED")) throw serviceError("CONFLICT", "cardsNotUnassigned");

    const organization = await repos.organizations.findById(organizationId);
    if (!organization || organization.status === "ARCHIVED")
      throw serviceError("NOT_FOUND", "organizationNotFound");
    const location = locationId ? await repos.locations.findById(locationId, { organizationId }) : null;
    if (locationId && !location) throw serviceError("VALIDATION", "locationNotFound");

    const [subscription, targets] = await Promise.all([
      repos.subscriptions.findByOrganization(organizationId),
      repos.targets.list({ organizationId, isVerified: true }),
    ]);
    const target =
      targets.find((t) => t.locationId === locationId && t.type === "TWOGIS_REVIEW") ??
      targets.find((t) => t.locationId === locationId) ??
      targets[0] ??
      null;

    const result = await repos.cards.assign({
      cardIds: cards.map((c) => c.id),
      organizationId,
      locationId,
      targetId: target?.id ?? null,
      activatedAt: this.clock().toISOString(),
      cardLimit: subscription?.cardLimit ?? null,
    });
    if (!result.ok) {
      throw result.reason === "LIMIT_EXCEEDED"
        ? serviceError("CONFLICT", "cardLimitExceeded")
        : result.reason === "NOT_UNASSIGNED"
          ? serviceError("CONFLICT", "cardsNotUnassigned")
          : serviceError("VALIDATION", "cardsNotFound");
    }

    await this.audit.recordMany(
      result.cards.map((card) => ({
        actorUserId: ctx.userId,
        action: "card.assign",
        entityType: "card",
        entityId: card.id,
        organizationId,
        before: { status: "UNASSIGNED", organizationId: null },
        after: { status: "ACTIVE", organizationId, locationId, targetId: card.targetId },
      })),
    );
    return result.cards;
  }

  /** Bulk status change; UNASSIGNED releases the card back to the pool. */
  async setStatus(ctx: AdminContext, cardIds: string[], status: CardStatus) {
    assertAdmin(ctx, "admin.cards.status");

    const cards = await this.resolveSelection({ cardIds });
    // A card gets a client only through assign(); any other status needs one already.
    if (status !== "UNASSIGNED" && cards.some((c) => !c.organizationId)) {
      throw serviceError("CONFLICT", "cardsNotAssigned");
    }
    const patch =
      status === "UNASSIGNED"
        ? {
            status,
            organizationId: null,
            locationId: null,
            employeeId: null,
            targetId: null,
            activatedAt: null,
          }
        : { status };
    await this.repositories.cards.updateMany(cardIds, patch);
    await this.audit.recordMany(
      cards.map((card): AuditEntry => ({
        actorUserId: ctx.userId,
        action: status === "UNASSIGNED" ? "card.unassign" : "card.status_change",
        entityType: "card",
        entityId: card.id,
        organizationId: card.organizationId,
        before: { status: card.status },
        after: { status },
      })),
    );
  }
}

function toCardFilter(filter: {
  search?: string;
  batchId?: string;
  organizationId?: string;
  status?: CardStatus;
}): CardFilter {
  return {
    search: filter.search,
    batchId: filter.batchId,
    organizationId: filter.organizationId,
    statuses: filter.status ? [filter.status] : undefined,
  };
}

/** ASCII-only file name part: HTTP headers cannot safely carry Cyrillic. */
function fileSlug(batch: { id: string; createdAt: string }): string {
  return `${batch.createdAt.slice(0, 10)}-${batch.id.slice(0, 8)}`;
}
