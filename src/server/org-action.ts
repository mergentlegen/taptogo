import "server-only";

import { getTranslations } from "next-intl/server";
import { refresh } from "next/cache";
import type { z } from "zod";

import { runAction, type ActionResult } from "@/server/actions";
import { authorizeOrgAction, type OrgAccess } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import type { OrgPermission } from "@/server/permissions";
import { orgContextFrom, type OrgContext } from "@/server/services/context";

/**
 * The standard pipeline for client-cabinet mutations:
 * Zod validation → permission check for the session's organization →
 * service call → refresh of the current page. The organization always comes
 * from the session, never from the submitted data.
 *
 * Staff viewing a cabinet (impersonation) are strictly read-only: no mutation
 * runs, not even ones that only need "org.view" (profile, notifications).
 */
export function runOrgAction<S extends z.ZodType, T>(
  permission: OrgPermission,
  schema: S,
  input: unknown,
  handler: (ctx: OrgContext, data: z.output<S>, access: OrgAccess) => Promise<T>,
): Promise<ActionResult<T>> {
  return runAction(schema, input, async (data) => {
    const access = await authorizeOrgAction(permission);
    if (access.session.impersonation) {
      throw new AppError("FORBIDDEN", (await getTranslations("errors.action"))("readOnly"));
    }
    const result = await handler(orgContextFrom(access), data, access);
    refresh();
    return result;
  });
}
