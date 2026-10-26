"use server";

import { z } from "zod";

import { runAccountAction } from "@/server/account-action";
import type { ActionResult } from "@/server/actions";
import { runOrgAction } from "@/server/org-action";
import { getServices } from "@/server/services";

import {
  changePasswordSchema,
  organizationSchema,
  profileSchema,
  type ChangePasswordInput,
  type OrganizationInput,
  type ProfileInput,
} from "./form-schemas";

/** Profile and security act on the signed-in user only; "org.view" just requires cabinet access. */
export async function updateProfileAction(input: ProfileInput): Promise<ActionResult> {
  return runOrgAction("org.view", profileSchema, input, async (ctx, data) => {
    await getServices().account.updateProfile(ctx.userId, data);
    return null;
  });
}

/** Runs for any signed-in person, including one with a temporary password. */
export async function changePasswordAction(input: ChangePasswordInput): Promise<ActionResult> {
  return runAccountAction(changePasswordSchema, input, async ({ userId, sessionId }, data) => {
    await getServices().account.changePassword({
      userId,
      currentSessionId: sessionId,
      currentPassword: data.currentPassword,
      newPassword: data.password,
    });
    return null;
  });
}

export async function revokeSessionAction(input: { sessionId: string }): Promise<ActionResult> {
  const schema = z.object({ sessionId: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/) });
  return runOrgAction("org.view", schema, input, async (ctx, { sessionId }) => {
    await getServices().account.revokeSession(ctx.userId, sessionId);
    return null;
  });
}

export async function updateOrganizationAction(input: OrganizationInput): Promise<ActionResult> {
  return runOrgAction("org.settings.manage", organizationSchema, input, async (ctx, data) => {
    await getServices().account.updateOrganization(ctx, data);
    return null;
  });
}
