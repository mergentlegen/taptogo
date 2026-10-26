import type { SupportTicket } from "@/features/support/schemas";
import { addDays, DEFAULT_TIME_ZONE, toLocalDate } from "@/lib/dates";
import type { Repositories } from "@/server/repositories";

/** Days without a tap after which an active card is worth a call to the client. */
export const IDLE_CARD_DAYS = 14;
/** Overview lists are teasers; full lists live on their own pages. */
const SHOWN = 20;

export type PlatformOverview = {
  activeClients: number;
  activeCards: number;
  tapsToday: number;
  taps7d: number;
  idleCards: {
    cardId: string;
    code: string;
    label: string;
    organizationId: string;
    organization: string;
    lastTapAt: string | null;
  }[];
  newTickets: (SupportTicket & { organization: string })[];
};

/**
 * Platform-wide numbers. Every query is a count, a sum or a bounded list, so
 * the page costs the same with 3 clients or 3 000.
 */
export class AdminOverviewService {
  constructor(
    private readonly repositories: Repositories,
    private readonly clock: () => Date,
  ) {}

  async overview(): Promise<PlatformOverview> {
    const repos = this.repositories;
    const now = this.clock();
    const today = toLocalDate(now, DEFAULT_TIME_ZONE);
    const idleSince = new Date(now.getTime() - IDLE_CARD_DAYS * 86_400_000).toISOString();

    const [organizations, activeCards, week, idle, tickets] = await Promise.all([
      repos.organizations.list(),
      repos.cards.count({ statuses: ["ACTIVE"] }),
      repos.dailyStats.totalsBy({ from: addDays(today, -6), to: today }, "date"),
      repos.cards.listIdle({
        activatedBefore: idleSince,
        noTapsSince: addDays(today, -(IDLE_CARD_DAYS - 1)),
        limit: SHOWN,
      }),
      repos.tickets.list({ statuses: ["NEW"], limit: SHOWN }),
    ]);
    const lastTaps = idle.length
      ? await repos.tapEvents.lastTapByCard({ cardIds: idle.map((c) => c.id) })
      : {};
    const organizationById = new Map(organizations.map((o) => [o.id, o]));
    const orgName = (id: string | null) => (id ? (organizationById.get(id)?.name ?? "—") : "—");

    return {
      activeClients: organizations.filter((o) => o.status === "ACTIVE").length,
      activeCards,
      tapsToday: week.find((d) => d.key === today)?.taps ?? 0,
      taps7d: week.reduce((sum, d) => sum + d.taps, 0),
      idleCards: idle.map((c) => ({
        cardId: c.id,
        code: c.code,
        label: c.label,
        organizationId: c.organizationId ?? "",
        organization: orgName(c.organizationId),
        lastTapAt: lastTaps[c.id] ?? null,
      })),
      newTickets: tickets.map((t) => ({ ...t, organization: orgName(t.organizationId) })),
    };
  }
}
