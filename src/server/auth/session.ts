import "server-only";

import { getTranslations } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";

import { getEnv } from "@/env";
import { CHANGE_PASSWORD_PATH } from "@/features/auth/redirect";
import type { Organization } from "@/features/organizations/schemas";
import type { OrgRole } from "@/features/team/schemas";
import { getContainer } from "@/server/container";
import { AppError } from "@/server/errors";
import {
  can,
  orgPermissionsFor,
  type Actor,
  type OrgPermission,
  type PlatformPermission,
} from "@/server/permissions";
import { clientIpFrom } from "@/server/security/client-ip";

import { ORG_COOKIE, orgCookieOptions, SESSION_COOKIE, sessionCookieOptions } from "./cookies";
import { resolveActiveMembership } from "./org-context";
import type { ClientInfo, IssuedSession, Session } from "./types";

/**
 * Request-scoped auth helpers. Every page calls a `require*` guard and every
 * Server Action an `authorize*` guard — layouts alone are not a protection.
 */

export async function getClientInfo(): Promise<ClientInfo> {
  const headerList = await headers();
  return { ip: clientIpFrom(headerList), userAgent: headerList.get("user-agent") };
}

/** Validated session of the current request, or null. Cached per request. */
export const getCurrentSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getContainer().auth.getSession(token);
});

export async function setSessionCookie(session: IssuedSession): Promise<void> {
  (await cookies()).set(
    SESSION_COOKIE,
    session.token,
    sessionCookieOptions(session.expiresAt, getEnv().isProduction),
  );
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function setActiveOrganizationCookie(organizationId: string): Promise<void> {
  (await cookies()).set(ORG_COOKIE, organizationId, orgCookieOptions(getEnv().isProduction));
}

// ── Organization context ──────────────────────────────────────────────────

export type OrgAccess = {
  session: Session;
  actor: Actor;
  organization: Organization;
  /** null while platform staff impersonate the organization. */
  role: OrgRole | null;
  permissions: OrgPermission[];
  /** Organizations the user can switch to. */
  /** Organizations the user can switch to (just the viewed one while impersonating). */
  organizations: { id: string; name: string; role: OrgRole | null }[];
};

type OrgAccessResult = OrgAccess | "NO_SESSION" | "NO_ORGANIZATION";

const loadOrgAccess = cache(async (): Promise<OrgAccessResult> => {
  const session = await getCurrentSession();
  if (!session) return "NO_SESSION";

  const { repositories } = getContainer();
  const memberships = await repositories.memberships.listByUser(session.user.id);
  const actor: Actor = {
    platformRole: session.user.platformRole,
    memberships,
    impersonation: session.impersonation ? { organizationId: session.impersonation.organizationId } : null,
  };

  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  const organizationId =
    session.impersonation?.organizationId ?? resolveActiveMembership(memberships, preferred)?.organizationId;
  if (!organizationId) return "NO_ORGANIZATION";

  const organizations = await repositories.organizations.listByIds(memberships.map((m) => m.organizationId));
  const organization =
    organizations.find((o) => o.id === organizationId) ??
    (await repositories.organizations.findById(organizationId));
  if (!organization || organization.status === "ARCHIVED") return "NO_ORGANIZATION";

  return {
    session,
    actor,
    organization,
    role: memberships.find((m) => m.organizationId === organizationId)?.role ?? null,
    permissions: orgPermissionsFor(actor, organizationId),
    organizations: session.impersonation
      ? [{ id: organization.id, name: organization.name, role: null }]
      : memberships.flatMap((m) => {
          const org = organizations.find((o) => o.id === m.organizationId && o.status !== "ARCHIVED");
          return org ? [{ id: org.id, name: org.name, role: m.role }] : [];
        }),
  };
});

const actorOf = (session: Session, memberships: Actor["memberships"] = []): Actor => ({
  platformRole: session.user.platformRole,
  memberships,
});

// ── Guards for pages and layouts ──────────────────────────────────────────

/** Signed in, and not holding a temporary password. Pages use this (or a require* below). */
export async function requireSession(): Promise<Session> {
  const session = await requireSessionAllowingTemporary();
  if (session.user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
  return session;
}

/** Signed in, whatever the password state: only the change-password page uses this. */
export async function requireSessionAllowingTemporary(): Promise<Session> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

export async function requirePlatformAccess(permission: PlatformPermission = "admin.access") {
  const session = await requireSession();
  const actor = actorOf(session);
  if (!can(actor, permission)) forbidden();
  return { session, actor };
}

export async function requireOrgAccess(permission: OrgPermission = "org.view"): Promise<OrgAccess> {
  const session = await getCurrentSession();
  if (session?.user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
  const access = await loadOrgAccess();
  if (access === "NO_SESSION") redirect("/login");
  if (access === "NO_ORGANIZATION" || !access.permissions.includes(permission)) forbidden();
  return access;
}

// ── Guards for Server Actions (return errors instead of navigating) ────────

export async function authorizeSession(): Promise<Session> {
  const session = await getCurrentSession();
  if (!session) throw new AppError("UNAUTHORIZED", (await getTranslations("errors.action"))("unauthorized"));
  return session;
}

/** Actions refuse everything but the password change while a temporary password is in use. */
async function authorizeCompletedSession(): Promise<Session> {
  const session = await authorizeSession();
  if (session.user.mustChangePassword)
    throw new AppError("FORBIDDEN", (await getTranslations("errors.action"))("mustChangePassword"));
  return session;
}

export async function authorizePlatformAction(permission: PlatformPermission) {
  const session = await authorizeCompletedSession();
  const actor = actorOf(session);
  if (!can(actor, permission))
    throw new AppError("FORBIDDEN", (await getTranslations("errors.action"))("forbidden"));
  return { session, actor };
}

export async function authorizeOrgAction(permission: OrgPermission): Promise<OrgAccess> {
  const access = await loadOrgAccess();
  if (access === "NO_SESSION")
    throw new AppError("UNAUTHORIZED", (await getTranslations("errors.action"))("unauthorized"));
  if (access !== "NO_ORGANIZATION" && access.session.user.mustChangePassword)
    throw new AppError("FORBIDDEN", (await getTranslations("errors.action"))("mustChangePassword"));
  if (access === "NO_ORGANIZATION" || !access.permissions.includes(permission)) {
    throw new AppError("FORBIDDEN", (await getTranslations("errors.action"))("forbidden"));
  }
  return access;
}
