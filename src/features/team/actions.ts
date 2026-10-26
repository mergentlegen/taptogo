"use server";

import type { ActionResult } from "@/server/actions";
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

/** Returns the invitation link for the owner to copy and send. */
export async function inviteMemberAction(input: InviteInput): Promise<ActionResult<{ link: string }>> {
  return runOrgAction("org.team.manage", inviteSchema, input, async (ctx, data) => {
    const { link } = await getServices().team.invite(ctx, data);
    return { link };
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
