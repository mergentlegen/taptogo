import { getEnv } from "@/env";
import type { Invitation, OrgRole } from "@/features/team/schemas";
import { randomToken, sha256Hex } from "@/server/auth/session-token";
import { invitationEmail } from "@/server/emails/templates";
import { serviceError } from "@/server/i18n";
import type { EmailProvider } from "@/server/providers/email/types";
import type { Repositories } from "@/server/repositories";
import { forOrganization } from "@/server/repositories/tenant";
import type { AuditService } from "@/server/services/audit-service";

import { assertOrgPermission, type OrgContext } from "./context";

export const INVITATION_TTL_DAYS = 7;

export type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  joinedAt: string;
  lastLoginAt: string | null;
  isCurrentUser: boolean;
};

export type PendingInvitation = Invitation & { status: "PENDING" | "EXPIRED" };

/** The invitation message is queued for manual sending; the link is shown on /admin/outbox. */
export type InvitationResult = { invitation: Invitation };

export class TeamService {
  constructor(
    private readonly repositories: Repositories,
    private readonly email: EmailProvider,
    private readonly audit: AuditService,
    private readonly clock: () => Date,
  ) {}

  private tenant(ctx: { organizationId: string }) {
    return forOrganization(this.repositories, ctx.organizationId);
  }

  async list(ctx: OrgContext): Promise<{ members: TeamMember[]; invitations: PendingInvitation[] }> {
    const repos = this.tenant(ctx);
    const [memberships, invitations, users] = await Promise.all([
      repos.members.list(),
      repos.invitations.list(),
      repos.members.users(),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const now = this.clock().toISOString();
    const roleOrder: Record<OrgRole, number> = { OWNER: 0, MANAGER: 1 };

    return {
      members: memberships
        .flatMap((m) => {
          const user = userById.get(m.userId);
          return user
            ? [
                {
                  userId: user.id,
                  name: user.name,
                  email: user.email,
                  role: m.role,
                  joinedAt: m.createdAt,
                  lastLoginAt: user.lastLoginAt,
                  isCurrentUser: user.id === ctx.userId,
                },
              ]
            : [];
        })
        .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.name.localeCompare(b.name, "ru")),
      invitations: invitations
        .filter((i) => !i.acceptedAt)
        .map((i) => ({ ...i, status: i.expiresAt > now ? ("PENDING" as const) : ("EXPIRED" as const) }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }

  /** An owner invites a teammate from the cabinet. */
  async invite(ctx: OrgContext, input: { email: string; role: OrgRole }): Promise<InvitationResult> {
    assertOrgPermission(ctx, "org.team.manage");
    return this.createInvitation({ organizationId: ctx.organizationId, invitedById: ctx.userId }, input);
  }

  /**
   * Shared by the cabinet and the admin "new client" wizard (which checks
   * platform permissions itself). A new invitation replaces any earlier
   * unaccepted one for the same address.
   */
  async createInvitation(
    by: { organizationId: string; invitedById: string },
    input: { email: string; role: OrgRole },
  ): Promise<InvitationResult> {
    const repos = this.tenant(by);
    const email = input.email.trim().toLowerCase();
    if (await repos.members.hasEmail(email)) throw serviceError("CONFLICT", "alreadyMember");

    for (const old of (await repos.invitations.list()).filter((i) => i.email === email && !i.acceptedAt)) {
      await repos.invitations.delete(old.id);
    }

    const organization = await repos.organization.get();
    const token = randomToken();
    const expires = new Date(this.clock().getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const invitation = await repos.invitations.create({
      email,
      role: input.role,
      invitedById: by.invitedById,
      expiresAt: expires.toISOString(),
      acceptedAt: null,
      tokenHash: await sha256Hex(token),
    });
    await this.audit.record({
      actorUserId: by.invitedById,
      action: "invitation.create",
      entityType: "invitation",
      entityId: invitation.id,
      organizationId: by.organizationId,
      after: { email, role: input.role },
    });

    await this.email.send(
      invitationEmail({
        to: email,
        organization: organization?.name ?? "TapToGo",
        role: input.role,
        link: new URL(`/invite/${token}`, getEnv().APP_URL).toString(),
        expires,
      }),
    );
    return { invitation };
  }

  async revokeInvitation(ctx: OrgContext, invitationId: string): Promise<void> {
    assertOrgPermission(ctx, "org.team.manage");
    const repos = this.tenant(ctx);
    const invitation = await repos.invitations.findById(invitationId);
    if (!invitation || invitation.acceptedAt) throw serviceError("NOT_FOUND", "invitationNotFound");
    await repos.invitations.delete(invitation.id);
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "invitation.revoke",
      entityType: "invitation",
      entityId: invitation.id,
      organizationId: ctx.organizationId,
      before: { email: invitation.email, role: invitation.role },
    });
  }

  async changeRole(ctx: OrgContext, userId: string, role: OrgRole): Promise<void> {
    assertOrgPermission(ctx, "org.team.manage");
    const repos = this.tenant(ctx);
    const membership = await repos.members.find(userId);
    if (!membership) throw serviceError("NOT_FOUND", "memberNotFound");
    if (membership.role === role) return;
    if (membership.role === "OWNER") await this.assertAnotherOwner(ctx, userId);

    await repos.members.updateRole(userId, role);
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "membership.role_change",
      entityType: "membership",
      entityId: userId,
      organizationId: ctx.organizationId,
      before: { role: membership.role },
      after: { role },
    });
  }

  async removeMember(ctx: OrgContext, userId: string): Promise<void> {
    assertOrgPermission(ctx, "org.team.manage");
    const repos = this.tenant(ctx);
    const membership = await repos.members.find(userId);
    if (!membership) throw serviceError("NOT_FOUND", "memberNotFound");
    if (membership.role === "OWNER") await this.assertAnotherOwner(ctx, userId);

    await repos.members.remove(userId);
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "membership.remove",
      entityType: "membership",
      entityId: userId,
      organizationId: ctx.organizationId,
      before: { role: membership.role },
    });
  }

  private async assertAnotherOwner(ctx: OrgContext, leavingUserId: string) {
    const memberships = await this.tenant(ctx).members.list();
    if (!memberships.some((m) => m.role === "OWNER" && m.userId !== leavingUserId)) {
      throw serviceError("CONFLICT", "lastOwner");
    }
  }
}
