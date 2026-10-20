import type { RedirectTarget, RedirectTargetType } from "@/features/targets/schemas";
import { checkTargetUrl, type TargetUrlCheck } from "@/features/targets/url-policy";
import { serviceError } from "@/server/i18n";
import type { Repositories } from "@/server/repositories";
import type { AuditService } from "@/server/services/audit-service";

import { assertAdmin, type AdminContext } from "./context";

export type TargetRow = RedirectTarget & {
  organization: string;
  location: string | null;
  cardsUsing: number;
  /** Whether the URL passes the current domain allowlist. */
  allowed: boolean;
};

/**
 * Redirect targets. A card only redirects to a target that is verified AND
 * passes the allowlist at tap time, so tightening the allowlist takes effect
 * immediately even for already-verified targets.
 */
export class AdminTargetService {
  constructor(
    private readonly repositories: Repositories,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<TargetRow[]> {
    const repos = this.repositories;
    const [targets, organizations, locations, cardsUsing, settings] = await Promise.all([
      repos.targets.list(),
      repos.organizations.list(),
      repos.locations.list(),
      repos.cards.countBy("targetId"),
      repos.platformSettings.get(),
    ]);
    const orgName = new Map(organizations.map((o) => [o.id, o.name]));
    const locName = new Map(locations.map((l) => [l.id, l.name]));
    return targets.map((t) => ({
      ...t,
      organization: orgName.get(t.organizationId) ?? "—",
      location: t.locationId ? (locName.get(t.locationId) ?? null) : null,
      cardsUsing: cardsUsing[t.id] ?? 0,
      allowed: checkTargetUrl(t.url, settings.allowedRedirectDomains).ok,
    }));
  }

  async check(url: string): Promise<TargetUrlCheck> {
    const settings = await this.repositories.platformSettings.get();
    return checkTargetUrl(url, settings.allowedRedirectDomains);
  }

  /** New targets start unverified; CUSTOM targets can only be created here, by staff. */
  async create(
    ctx: AdminContext,
    input: { organizationId: string; locationId: string | null; type: RedirectTargetType; url: string },
  ): Promise<RedirectTarget> {
    assertAdmin(ctx, "admin.manage");
    const repos = this.repositories;
    const check = await this.check(input.url);
    if (!check.ok) throw serviceError("VALIDATION", "targetNotAllowed");
    if (!(await repos.organizations.findById(input.organizationId))) {
      throw serviceError("NOT_FOUND", "organizationNotFound");
    }
    if (
      input.locationId &&
      !(await repos.locations.findById(input.locationId, { organizationId: input.organizationId }))
    ) {
      throw serviceError("VALIDATION", "locationNotFound");
    }
    const target = await repos.targets.create({ ...input, url: check.url, isVerified: false });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "target.create",
      entityType: "target",
      entityId: target.id,
      organizationId: target.organizationId,
      after: { type: target.type, url: target.url },
    });
    return target;
  }

  async setVerified(ctx: AdminContext, targetId: string, isVerified: boolean): Promise<void> {
    assertAdmin(ctx, "admin.manage");
    const target = await this.repositories.targets.findById(targetId);
    if (!target) throw serviceError("NOT_FOUND", "targetNotFound");
    if (isVerified && !(await this.check(target.url)).ok)
      throw serviceError("VALIDATION", "targetNotAllowed");
    await this.repositories.targets.update(targetId, { isVerified });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: isVerified ? "target.verify" : "target.unverify",
      entityType: "target",
      entityId: targetId,
      organizationId: target.organizationId,
      before: { isVerified: target.isVerified },
      after: { isVerified },
    });
  }
}
