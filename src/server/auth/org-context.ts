import type { OrgRole } from "@/features/team/schemas";

type MembershipRef = { organizationId: string; role: OrgRole };

/**
 * Picks the organization the cabinet shows. The cookie is only a preference:
 * it wins only if the user really is a member, otherwise the first
 * membership is used. A forged cookie therefore can't open someone else's data.
 */
export function resolveActiveMembership<M extends MembershipRef>(
  memberships: readonly M[],
  preferredOrganizationId: string | undefined,
): M | null {
  return memberships.find((m) => m.organizationId === preferredOrganizationId) ?? memberships[0] ?? null;
}
