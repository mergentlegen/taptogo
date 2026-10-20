"use server";

import { z } from "zod";

import type { ActionResult } from "@/server/actions";
import { serviceError } from "@/server/i18n";
import { runOrgAction } from "@/server/org-action";
import { getServices } from "@/server/services";

import {
  changePasswordSchema,
  notificationsSchema,
  organizationSchema,
  profileSchema,
  type ChangePasswordInput,
  type NotificationsInput,
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

export async function changePasswordAction(input: ChangePasswordInput): Promise<ActionResult> {
  return runOrgAction("org.view", changePasswordSchema, input, async (ctx, data, access) => {
    await getServices().account.changePassword({
      userId: ctx.userId,
      currentSessionId: access.session.id,
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

const logoSchema = z.instanceof(FormData);

/** Receives the file as FormData; size and real type are checked by the service. */
export async function uploadLogoAction(formData: FormData): Promise<ActionResult> {
  return runOrgAction("org.settings.manage", logoSchema, formData, async (ctx, data) => {
    const file = data.get("logo");
    if (!(file instanceof File)) throw serviceError("VALIDATION", "logoBadType");
    await getServices().account.uploadLogo(ctx, new Uint8Array(await file.arrayBuffer()));
    return null;
  });
}

export async function removeLogoAction(): Promise<ActionResult> {
  return runOrgAction("org.settings.manage", z.undefined(), undefined, async (ctx) => {
    await getServices().account.removeLogo(ctx);
    return null;
  });
}

export async function updateNotificationsAction(input: Partial<NotificationsInput>): Promise<ActionResult> {
  return runOrgAction("org.view", notificationsSchema.partial(), input, async (ctx, data) => {
    await getServices().account.updateNotifications(ctx, data);
    return null;
  });
}
