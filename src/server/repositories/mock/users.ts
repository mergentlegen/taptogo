import { notFoundError, serviceError } from "@/server/i18n";

import type { InvitationRepository, MembershipRepository, UserRepository } from "../users";
import { applyPatch, clone, cloneOrNull, requireRow, type MockContext } from "./context";

export function mockUserRepository({ db, clock, newId }: MockContext): UserRepository {
  return {
    async findById(id) {
      return cloneOrNull(db.users.find((u) => u.id === id));
    },
    async findByEmail(email) {
      const normalized = email.trim().toLowerCase();
      return cloneOrNull(db.users.find((u) => u.email === normalized));
    },
    async listByIds(ids) {
      const wanted = new Set(ids);
      return clone(db.users.filter((u) => wanted.has(u.id)));
    },
    async listPlatformStaff() {
      return clone(db.users.filter((u) => u.platformRole !== null));
    },
    async create(input) {
      const email = input.email.trim().toLowerCase();
      if (db.users.some((u) => u.email === email)) {
        throw serviceError("CONFLICT", "userExists");
      }
      const user = { ...clone(input), email, id: newId(), createdAt: clock().toISOString() };
      db.users.push(user);
      return clone(user);
    },
    async update(id, patch) {
      const user = requireRow(
        db.users.find((u) => u.id === id),
        "User",
      );
      return clone(applyPatch(user, patch));
    },
  };
}

export function mockMembershipRepository({ db, clock }: MockContext): MembershipRepository {
  const find = (userId: string, organizationId: string) =>
    db.memberships.find((m) => m.userId === userId && m.organizationId === organizationId);

  return {
    async listByUser(userId) {
      return clone(db.memberships.filter((m) => m.userId === userId));
    },
    async listByOrganization(organizationId) {
      return clone(db.memberships.filter((m) => m.organizationId === organizationId));
    },
    async find(userId, organizationId) {
      return cloneOrNull(find(userId, organizationId));
    },
    async create(input) {
      if (find(input.userId, input.organizationId)) {
        throw serviceError("CONFLICT", "alreadyMember");
      }
      const membership = { ...input, createdAt: clock().toISOString() };
      db.memberships.push(membership);
      return clone(membership);
    },
    async updateRole(userId, organizationId, role) {
      const membership = requireRow(find(userId, organizationId), "Membership");
      membership.role = role;
      return clone(membership);
    },
    async delete(userId, organizationId) {
      const index = db.memberships.findIndex(
        (m) => m.userId === userId && m.organizationId === organizationId,
      );
      if (index === -1) throw notFoundError("Membership");
      db.memberships.splice(index, 1);
    },
  };
}

export function mockInvitationRepository({ db, clock, newId }: MockContext): InvitationRepository {
  /** The hash never leaves the repository. */
  const strip = ({ tokenHash: _tokenHash, ...invitation }: (typeof db.invitations)[number]) =>
    clone(invitation);

  return {
    async findById(id) {
      const row = db.invitations.find((i) => i.id === id);
      return row ? strip(row) : null;
    },
    async findByTokenHash(tokenHash) {
      const row = db.invitations.find((i) => i.tokenHash === tokenHash);
      return row ? strip(row) : null;
    },
    async listByOrganization(organizationId) {
      return db.invitations.filter((i) => i.organizationId === organizationId).map(strip);
    },
    async create(input) {
      const row = { ...clone(input), id: newId(), createdAt: clock().toISOString() };
      db.invitations.push(row);
      return strip(row);
    },
    async markAccepted(id, acceptedAt) {
      const row = requireRow(
        db.invitations.find((i) => i.id === id),
        "Invitation",
      );
      row.acceptedAt = acceptedAt;
      return strip(row);
    },
    async delete(id) {
      const index = db.invitations.findIndex((i) => i.id === id);
      if (index === -1) throw notFoundError("Invitation");
      db.invitations.splice(index, 1);
    },
  };
}
