"use server";

import type { ActionResult } from "@/server/actions";
import { serviceError } from "@/server/i18n";
import { runOrgAction } from "@/server/org-action";
import { getServices } from "@/server/services";

import {
  changeRoleSchema,
  invitationIdSchema,
  inviteSchema,
  memberSchema,
  type InviteInput,
} from "./form-schemas";
import type { OrgRole } from "./schemas";

export async function inviteMemberAction(input: InviteInput): Promise<ActionResult> {
  return runOrgAction("org.team.manage", inviteSchema, input, async (ctx, data) => {
    const { emailSent } = await getServices().team.invite(ctx, data);
    // Saved but not delivered: say so, a retry sends a fresh link.
    if (!emailSent) throw serviceError("INTERNAL", "invitationEmailFailed");
    return null;
  });
}

export async function revokeInvitationAction(input: { invitationId: string }): Promise<ActionResult> {
  return runOrgAction("org.team.manage", invitationIdSchema, input, async (ctx, { invitationId }) => {
    await getServices().team.revokeInvitation(ctx, invitationId);
    return null;
  });
}

export async function changeMemberRoleAction(input: {
  userId: string;
  role: OrgRole;
}): Promise<ActionResult> {
  return runOrgAction("org.team.manage", changeRoleSchema, input, async (ctx, { userId, role }) => {
    await getServices().team.changeRole(ctx, userId, role);
    return null;
  });
}

export async function removeMemberAction(input: { userId: string }): Promise<ActionResult> {
  return runOrgAction("org.team.manage", memberSchema, input, async (ctx, { userId }) => {
    await getServices().team.removeMember(ctx, userId);
    return null;
  });
}
