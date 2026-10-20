import type { Lead, SubmitLeadData } from "@/features/leads/schemas";
import type { PlanConfig } from "@/features/platform/schemas";
import { newLeadEmail } from "@/server/emails/templates";
import { serviceError } from "@/server/i18n";
import type { EmailProvider } from "@/server/providers/email/types";
import type { Repositories } from "@/server/repositories";
import type { RateLimiter, RateLimitRule } from "@/server/security/rate-limiter";
import type { AuditService } from "@/server/services/audit-service";

const HOUR = 60 * 60 * 1000;
/** Generous for a real person retrying, tight enough to stop a flood from one address. */
export const LEAD_IP_RULE: RateLimitRule = { limit: 5, windowMs: HOUR };
export const LEAD_PHONE_RULE: RateLimitRule = { limit: 3, windowMs: 24 * HOUR };

/** Public landing page: pricing and the "leave a request" form. No session involved. */
export class LeadService {
  constructor(
    private readonly repositories: Repositories,
    private readonly rateLimiter: RateLimiter,
    private readonly email: EmailProvider,
    private readonly audit: AuditService,
    private readonly appUrl: () => string,
  ) {}

  /** Current plans from platform settings, so the landing always matches what staff configured. */
  async plans(): Promise<PlanConfig[]> {
    return (await this.repositories.platformSettings.get()).plans;
  }

  /**
   * Stores the request as a NEW lead (visible in /admin/leads) and notifies
   * admins. The IP is used only as an in-memory rate-limit key, never stored.
   */
  async submit(input: SubmitLeadData, client: { ip: string | null }): Promise<Lead> {
    const keys = [
      { key: `lead:ip:${client.ip ?? "unknown"}`, rule: LEAD_IP_RULE },
      { key: `lead:phone:${input.phone}`, rule: LEAD_PHONE_RULE },
    ];
    const states = await Promise.all(keys.map(({ key, rule }) => this.rateLimiter.check(key, rule)));
    if (states.some((s) => !s.allowed)) throw serviceError("RATE_LIMITED", "leadTooOften");
    await Promise.all(keys.map(({ key, rule }) => this.rateLimiter.hit(key, rule)));

    const lead = await this.repositories.leads.create({
      ...input,
      status: "NEW",
      assigneeId: null,
    });
    await this.audit.record({
      actorUserId: null,
      action: "lead.create",
      entityType: "lead",
      entityId: lead.id,
      after: { businessName: lead.businessName, city: lead.city },
    });
    await this.notifyStaff(lead);
    return lead;
  }

  /** A failed notification must not lose the lead: it is already saved and shown in the admin panel. */
  private async notifyStaff(lead: Lead) {
    try {
      const staff = await this.repositories.users.listPlatformStaff();
      const link = new URL(`/admin/leads#lead-${lead.id}`, this.appUrl()).toString();
      await Promise.all(
        staff
          .filter(
            (u) => u.status === "ACTIVE" && (u.platformRole === "SUPER_ADMIN" || u.platformRole === "ADMIN"),
          )
          .map((u) => this.email.send(newLeadEmail({ to: u.email, lead, link }))),
      );
    } catch (error) {
      console.error("[leads] staff notification failed", error);
    }
  }
}
