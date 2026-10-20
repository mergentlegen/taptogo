"use server";

import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { idSchema } from "@/lib/schemas";
import { runAction, type ActionResult } from "@/server/actions";
import { authorizeSession, setActiveOrganizationCookie } from "@/server/auth/session";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors";

const switchSchema = z.object({ organizationId: idSchema });

/** Changes the active organization; only to one the user really belongs to. */
export async function switchOrganizationAction(input: { organizationId: string }): Promise<ActionResult> {
  return runAction(switchSchema, input, async ({ organizationId }) => {
    const session = await authorizeSession();
    const membership = await getContainer().repositories.memberships.find(session.user.id, organizationId);
    if (!membership) throw new AppError("FORBIDDEN", (await getTranslations("errors.action"))("forbidden"));

    await setActiveOrganizationCookie(organizationId);
    return null;
  });
}
