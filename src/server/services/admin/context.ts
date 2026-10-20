import type { PlatformRole } from "@/features/users/schemas";
import { serviceError } from "@/server/i18n";
import { can, type PlatformPermission } from "@/server/permissions";

/** A platform staff member acting in the admin panel (from the verified session). */
export type AdminContext = {
  userId: string;
  role: PlatformRole;
  sessionId: string;
};

/** Second line of defense inside services, on top of the action-level check. */
export function assertAdmin(ctx: AdminContext, permission: PlatformPermission): void {
  if (!can({ platformRole: ctx.role, memberships: [] }, permission)) {
    throw serviceError("FORBIDDEN", "forbidden");
  }
}
