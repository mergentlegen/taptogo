import { describe, expect, it } from "vitest";

import type { OrgRole } from "@/features/team/schemas";
import type { PlatformRole } from "@/features/users/schemas";

import {
  can,
  orgPermissionsFor,
  type Actor,
  type OrgPermission,
  type PlatformPermission,
} from "./permissions";

const ORG_A = "org-a";
const ORG_B = "org-b";

const staff = (platformRole: PlatformRole): Actor => ({ platformRole, memberships: [] });
const member = (role: OrgRole): Actor => ({
  platformRole: null,
  memberships: [{ organizationId: ORG_A, role }],
});

describe("platform permissions (a single ADMIN role)", () => {
  const cases: [PlatformPermission, PlatformRole[]][] = [
    ["admin.access", ["ADMIN"]],
    ["admin.manage", ["ADMIN"]],
    ["admin.cards.status", ["ADMIN"]],
    ["admin.inbox", ["ADMIN"]],
    ["admin.impersonate", ["ADMIN"]],
    ["admin.staff.manage", ["ADMIN"]],
    ["admin.settings.manage", ["ADMIN"]],
  ];

  it.each(cases)("%s is granted exactly to %j", (permission, granted) => {
    for (const role of ["ADMIN"] as const) {
      expect(can(staff(role), permission)).toBe(granted.includes(role));
    }
  });

  it("is never granted to client users", () => {
    for (const role of ["OWNER", "MANAGER"] as const) {
      expect(can(member(role), "admin.access")).toBe(false);
    }
  });
});

describe("organization permissions", () => {
  const cases: [OrgPermission, OrgRole[]][] = [
    ["org.view", ["OWNER", "MANAGER"]],
    ["org.export", ["OWNER", "MANAGER"]],
    ["org.support", ["OWNER", "MANAGER"]],
    ["org.cards.manage", ["OWNER", "MANAGER"]],
    ["org.employees.manage", ["OWNER", "MANAGER"]],
    ["org.team.manage", ["OWNER"]],
    ["org.settings.manage", ["OWNER"]],
  ];

  it.each(cases)("%s is granted exactly to %j", (permission, granted) => {
    for (const role of ["OWNER", "MANAGER"] as const) {
      expect(can(member(role), permission, { organizationId: ORG_A })).toBe(granted.includes(role));
    }
  });

  it("never grants anything in another organization", () => {
    for (const role of ["OWNER", "MANAGER"] as const) {
      expect(orgPermissionsFor(member(role), ORG_B)).toEqual([]);
    }
  });

  it("does not give platform staff client access by role alone", () => {
    expect(can(staff("ADMIN"), "org.view", { organizationId: ORG_A })).toBe(false);
  });

  it("lets impersonating staff only view that one organization", () => {
    const actor: Actor = { ...staff("ADMIN"), impersonation: { organizationId: ORG_A } };

    expect(orgPermissionsFor(actor, ORG_A)).toEqual(["org.view"]);
    expect(can(actor, "org.view", { organizationId: ORG_B })).toBe(false);
  });

  it("uses the role of the matching membership for multi-organization users", () => {
    const actor: Actor = {
      platformRole: null,
      memberships: [
        { organizationId: ORG_A, role: "OWNER" },
        { organizationId: ORG_B, role: "MANAGER" },
      ],
    };

    expect(can(actor, "org.team.manage", { organizationId: ORG_A })).toBe(true);
    expect(can(actor, "org.team.manage", { organizationId: ORG_B })).toBe(false);
  });
});
