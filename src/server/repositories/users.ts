import type { Invitation, Membership, OrgRole } from "@/features/team/schemas";
import type { User } from "@/features/users/schemas";

import type { NewEntity } from "./common";

export type UserPatch = Partial<
  Pick<User, "name" | "phone" | "platformRole" | "status" | "totpEnabled" | "lastLoginAt">
>;

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  /** Email is matched case-insensitively. */
  findByEmail(email: string): Promise<User | null>;
  listByIds(ids: readonly string[]): Promise<User[]>;
  /** Users with a platformRole (TapToGo staff). */
  listPlatformStaff(): Promise<User[]>;
  create(input: NewEntity<User>): Promise<User>;
  update(id: string, patch: UserPatch): Promise<User>;
}

export interface MembershipRepository {
  listByUser(userId: string): Promise<Membership[]>;
  listByOrganization(organizationId: string): Promise<Membership[]>;
  find(userId: string, organizationId: string): Promise<Membership | null>;
  create(input: Omit<Membership, "createdAt">): Promise<Membership>;
  updateRole(userId: string, organizationId: string, role: OrgRole): Promise<Membership>;
  delete(userId: string, organizationId: string): Promise<void>;
}

export interface InvitationRepository {
  findById(id: string): Promise<Invitation | null>;
  /** Looks up by SHA-256 hash of the token; the raw token is never stored. */
  findByTokenHash(tokenHash: string): Promise<Invitation | null>;
  listByOrganization(organizationId: string): Promise<Invitation[]>;
  create(input: NewEntity<Invitation> & { tokenHash: string }): Promise<Invitation>;
  markAccepted(id: string, acceptedAt: string): Promise<Invitation>;
  delete(id: string): Promise<void>;
}
