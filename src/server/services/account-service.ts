import type { NotificationSetting } from "@/features/notifications/schemas";
import type { Organization } from "@/features/organizations/schemas";
import { LOGO_MAX_BYTES } from "@/features/settings/form-schemas";
import type { User } from "@/features/users/schemas";
import { detectImageType } from "@/lib/image-type";
import type { AuthService, SessionInfo } from "@/server/auth/types";
import { serviceError } from "@/server/i18n";
import type { StorageProvider } from "@/server/providers/storage/types";
import type { Repositories } from "@/server/repositories";
import { forOrganization } from "@/server/repositories/tenant";
import type { AuditService } from "@/server/services/audit-service";

import { assertOrgPermission, auditDiff, type OrgContext } from "./context";

/** Profile, password, sessions, organization details, logo and notification settings. */
export class AccountService {
  constructor(
    private readonly repositories: Repositories,
    private readonly auth: AuthService,
    private readonly storage: StorageProvider,
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
    input: Pick<Organization, "name" | "legalName" | "bin" | "contactName" | "contactPhone" | "contactEmail">,
  ): Promise<Organization> {
    assertOrgPermission(ctx, "org.settings.manage");
    const repos = forOrganization(this.repositories, ctx.organizationId);
    const before = await repos.organization.get();
    if (!before) throw serviceError("NOT_FOUND", "memberNotFound");
    const after = await repos.organization.update(input);
    const diff = auditDiff(before, after, [
      "name",
      "legalName",
      "bin",
      "contactName",
      "contactPhone",
      "contactEmail",
    ]);
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

  /** Type is decided by the file's bytes, not by its name or the browser's claim. */
  async uploadLogo(ctx: OrgContext, bytes: Uint8Array): Promise<void> {
    assertOrgPermission(ctx, "org.settings.manage");
    const repos = forOrganization(this.repositories, ctx.organizationId);
    if (bytes.byteLength > LOGO_MAX_BYTES) throw serviceError("VALIDATION", "logoTooLarge");
    const type = detectImageType(bytes);
    if (!type) throw serviceError("VALIDATION", "logoBadType");

    const organization = await repos.organization.get();
    const key = `logos/${ctx.organizationId}/${crypto.randomUUID()}.${type.extension}`;
    await this.storage.upload({ key, contentType: type.mime, body: bytes });
    await repos.organization.update({ logoUrl: key });
    if (organization?.logoUrl) await this.storage.delete(organization.logoUrl);
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "organization.logo_update",
      entityType: "organization",
      entityId: ctx.organizationId,
      organizationId: ctx.organizationId,
      after: { contentType: type.mime, size: bytes.byteLength },
    });
  }

  async removeLogo(ctx: OrgContext): Promise<void> {
    assertOrgPermission(ctx, "org.settings.manage");
    const repos = forOrganization(this.repositories, ctx.organizationId);
    const organization = await repos.organization.get();
    if (!organization?.logoUrl) return;
    await this.storage.delete(organization.logoUrl);
    await repos.organization.update({ logoUrl: null });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "organization.logo_remove",
      entityType: "organization",
      entityId: ctx.organizationId,
      organizationId: ctx.organizationId,
    });
  }

  async logoUrl(organization: Pick<Organization, "logoUrl">): Promise<string | null> {
    return organization.logoUrl
      ? this.storage.getSignedUrl(organization.logoUrl, { expiresInSeconds: 300 })
      : null;
  }

  async notifications(ctx: OrgContext): Promise<NotificationSetting> {
    return (
      (await forOrganization(this.repositories, ctx.organizationId).notificationSettings.find(
        ctx.userId,
      )) ?? {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        weeklyReportEmail: false,
        lowActivityAlert: false,
      }
    );
  }

  async updateNotifications(
    ctx: OrgContext,
    input: Partial<Pick<NotificationSetting, "weeklyReportEmail" | "lowActivityAlert">>,
  ): Promise<NotificationSetting> {
    const { organizationId: _ignored, ...current } = await this.notifications(ctx);
    return forOrganization(this.repositories, ctx.organizationId).notificationSettings.upsert({
      ...current,
      ...input,
      userId: ctx.userId,
    });
  }
}
