import type { OrgRole } from "@/features/team/schemas";
import type { PlatformRole } from "@/features/users/schemas";

/**
 * Single permission matrix for UI and server. The UI uses it to hide
 * controls; the server uses the very same `can()` to enforce access, because
 * a hidden button is not a protection.
 *
 * Kept free of server-only imports so client components may import it too.
 */

export const platformPermissions = {
  /** Open the admin panel and read everything in it. */
  "admin.access": ["SUPER_ADMIN", "ADMIN", "SUPPORT"],
  /** Create/edit clients, locations, targets, batches, payments, subscriptions. */
  "admin.manage": ["SUPER_ADMIN", "ADMIN"],
  /** Pause a card or mark it lost (support handles these calls). */
  "admin.cards.status": ["SUPER_ADMIN", "ADMIN", "SUPPORT"],
  /** Read-only view of a client's cabinet. */
  "admin.impersonate": ["SUPER_ADMIN", "ADMIN", "SUPPORT"],
  /**
   * Work the inbox: ticket/lead status, assignee, internal comments.
   * Includes SUPPORT (handling tickets is their job) — a deliberate extension
   * of the spec matrix, which lists SUPPORT as read-only + card status.
   */
  "admin.inbox": ["SUPER_ADMIN", "ADMIN", "SUPPORT"],
  "admin.staff.manage": ["SUPER_ADMIN"],
  "admin.settings.manage": ["SUPER_ADMIN"],
} as const satisfies Record<string, readonly PlatformRole[]>;

export const orgPermissions = {
  /** Dashboard, cards, locations, employees and reports of the organization. */
  "org.view": ["OWNER", "MANAGER", "VIEWER"],
  "org.export": ["OWNER", "MANAGER", "VIEWER"],
  "org.support": ["OWNER", "MANAGER", "VIEWER"],
  "org.cards.manage": ["OWNER", "MANAGER"],
  "org.employees.manage": ["OWNER", "MANAGER"],
  "org.team.manage": ["OWNER"],
  "org.settings.manage": ["OWNER"],
} as const satisfies Record<string, readonly OrgRole[]>;

export type PlatformPermission = keyof typeof platformPermissions;
export type OrgPermission = keyof typeof orgPermissions;
export type Permission = PlatformPermission | OrgPermission;

/** What platform staff may do inside a client cabinet while impersonating. */
const readOnlyOrgPermissions: readonly OrgPermission[] = ["org.view"];

export type Actor = {
  platformRole: PlatformRole | null;
  memberships: readonly { organizationId: string; role: OrgRole }[];
  /** Set while a staff member views a client cabinet (stage 6). */
  impersonation?: { organizationId: string } | null;
};

export function isOrgPermission(permission: Permission): permission is OrgPermission {
  return permission in orgPermissions;
}

export function can(actor: Actor, permission: PlatformPermission): boolean;
export function can(actor: Actor, permission: OrgPermission, resource: { organizationId: string }): boolean;
export function can(actor: Actor, permission: Permission, resource?: { organizationId: string }): boolean {
  if (!isOrgPermission(permission)) {
    const allowed: readonly PlatformRole[] = platformPermissions[permission];
    return actor.platformRole !== null && allowed.includes(actor.platformRole);
  }

  if (!resource) return false;
  if (actor.impersonation?.organizationId === resource.organizationId) {
    return readOnlyOrgPermissions.includes(permission);
  }
  const membership = actor.memberships.find((m) => m.organizationId === resource.organizationId);
  const allowed: readonly OrgRole[] = orgPermissions[permission];
  return membership !== undefined && allowed.includes(membership.role);
}

/** Every org permission the actor holds in one organization — handy for passing to the UI. */
export function orgPermissionsFor(actor: Actor, organizationId: string): OrgPermission[] {
  return (Object.keys(orgPermissions) as OrgPermission[]).filter((p) => can(actor, p, { organizationId }));
}
