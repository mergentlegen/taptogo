import "server-only";

import { refresh } from "next/cache";
import type { z } from "zod";

import { runAction, type ActionResult } from "@/server/actions";
import { authorizePlatformAction } from "@/server/auth/session";
import type { PlatformPermission } from "@/server/permissions";
import type { AdminContext } from "@/server/services/admin/context";

/**
 * Admin-panel mutations: Zod validation → platform permission check →
 * service call → page refresh. Mirrors runOrgAction for the client cabinet.
 */
export function runAdminAction<S extends z.ZodType, T>(
  permission: PlatformPermission,
  schema: S,
  input: unknown,
  handler: (ctx: AdminContext, data: z.output<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  return runAction(schema, input, async (data) => {
    const { session } = await authorizePlatformAction(permission);
    const role = session.user.platformRole;
    if (!role) throw new Error("unreachable: authorized without a platform role");
    const result = await handler({ userId: session.user.id, role, sessionId: session.id }, data);
    refresh();
    return result;
  });
}
