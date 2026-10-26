import type { Organization } from "@/features/organizations/schemas";
import type { User } from "@/features/users/schemas";
import type { AuthService, SessionInfo } from "@/server/auth/types";
import { serviceError } from "@/server/i18n";
import type { Repositories } from "@/server/repositories";
import { forOrganization } from "@/server/repositories/tenant";
import type { AuditService } from "@/server/services/audit-service";

import { assertOrgPermission, auditDiff, type OrgContext } from "./context";

/** Profile, password, sessions and organization details. */
export class AccountService {
  constructor(
    private readonly repositories: Repositories,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  profile(userId: string): Promise<User | null> {
    return this.repositories.users.findById(userId);
  }

  /** The caller's own profile — personal data, not organization data, hence plain `users`. */
  async updateProfile(userId: string, input: { name: string; phone: string | null }): Promise<User> {
    const before = await this.repositories.users.findById(userId);
    if (!before) throw serviceError("NOT_FOUND", "memberNotFound");
    const after = await this.repositories.users.update(userId, input);
    const diff = auditDiff(before, after, ["name", "phone"]);
    if (diff) {
      await this.audit.record({
        actorUserId: userId,
        action: "user.update",
        entityType: "user",
        entityId: userId,
        ...diff,
      });
    }
    return after;
  }

  async changePassword(input: {
    userId: string;
    currentSessionId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    const result = await this.auth.changePassword(input);
    if (!result.ok) {
      throw result.reason === "RATE_LIMITED"
        ? serviceError("RATE_LIMITED", "tooManyAttempts")
        : serviceError("VALIDATION", "wrongPassword");
    }
  }

  async sessions(userId: string, currentSessionId: string): Promise<(SessionInfo & { current: boolean })[]> {
    const sessions = await this.auth.listSessions(userId);
    return sessions.map((s) => ({ ...s, current: s.id === currentSessionId }));
  }

  revokeSession(userId: string, sessionId: string): Promise<void> {
    return this.auth.revokeSession(userId, sessionId);
  }

  async updateOrganization(
    ctx: OrgContext,
    input: Pick<Organization, "name" | "contactName" | "contactPhone" | "contactEmail">,
  ): Promise<Organization> {
    assertOrgPermission(ctx, "org.settings.manage");
    const repos = forOrganization(this.repositories, ctx.organizationId);
    const before = await repos.organization.get();
    if (!before) throw serviceError("NOT_FOUND", "memberNotFound");
    const after = await repos.organization.update(input);
    const diff = auditDiff(before, after, ["name", "contactName", "contactPhone", "contactEmail"]);
    if (diff) {
      await this.audit.record({
        actorUserId: ctx.userId,
        action: "organization.update",
        entityType: "organization",
        entityId: ctx.organizationId,
        organizationId: ctx.organizationId,
        ...diff,
      });
    }
    return after;
  }
}
