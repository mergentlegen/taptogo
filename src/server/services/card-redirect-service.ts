import { isCardCode } from "@/features/cards/code";
import type { Card } from "@/features/cards/schemas";
import { checkTargetUrl } from "@/features/targets/url-policy";
import type { Repositories } from "@/server/repositories";

export type RedirectableCard = Pick<Card, "id" | "code" | "locationId" | "employeeId"> & {
  organizationId: string;
};

export type CardRedirectDecision =
  | { kind: "REDIRECT"; url: string; card: RedirectableCard; timeZone: string }
  /** Malformed or unknown code. */
  | { kind: "NOT_FOUND" }
  /** Printed but not yet given to a client. */
  | { kind: "NOT_ACTIVATED" }
  /** Paused, lost, revoked, no usable target, or the client is archived. Reason is never shown. */
  | { kind: "INACTIVE" };

/**
 * Decides where a tapped card leads. The URL always comes from the stored,
 * verified target — never from the request — and is re-checked against the
 * current domain allowlist, so a target that became disallowed stops working.
 *
 * Subscription status deliberately doesn't matter: guests of a client with
 * an expired subscription still reach the review page.
 */
export class CardRedirectService {
  constructor(
    private readonly repositories: Pick<
      Repositories,
      "cards" | "targets" | "organizations" | "platformSettings"
    >,
  ) {}

  async resolve(code: string): Promise<CardRedirectDecision> {
    if (!isCardCode(code)) return { kind: "NOT_FOUND" };

    const card = await this.repositories.cards.findByCode(code);
    if (!card) return { kind: "NOT_FOUND" };
    if (card.status === "UNASSIGNED" || !card.organizationId) return { kind: "NOT_ACTIVATED" };
    if (card.status !== "ACTIVE" || !card.targetId) return { kind: "INACTIVE" };

    const scope = { organizationId: card.organizationId };
    const [target, organization, settings] = await Promise.all([
      this.repositories.targets.findById(card.targetId, scope),
      this.repositories.organizations.findById(card.organizationId),
      this.repositories.platformSettings.get(),
    ]);
    if (!target?.isVerified || !organization || organization.status === "ARCHIVED") {
      return { kind: "INACTIVE" };
    }

    const check = checkTargetUrl(target.url, settings.allowedRedirectDomains);
    if (!check.ok) {
      console.warn(`[redirect] target ${target.id} rejected by allowlist: ${check.reason}`);
      return { kind: "INACTIVE" };
    }

    return {
      kind: "REDIRECT",
      url: check.url,
      card: { ...card, organizationId: card.organizationId },
      timeZone: organization.timezone,
    };
  }
}
