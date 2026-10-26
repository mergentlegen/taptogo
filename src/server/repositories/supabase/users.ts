import "server-only";

import { invitationSchema, membershipSchema } from "@/features/team/schemas";
import { userSchema } from "@/features/users/schemas";
import { notFoundError } from "@/server/i18n";

import type { InvitationRepository, MembershipRepository, UserRepository } from "../users";
import { chunk, fromRow, fromRows, ok, one, rows, toRow, type DbGetter } from "./support";

export function supabaseUserRepository(db: DbGetter): UserRepository {
  return {
    async findById(id) {
      const c = await db();
      const data = ok(await c.from("users").select("*").eq("id", id).maybeSingle());
      return data ? fromRow(userSchema, data) : null;
    },
    async findByEmail(email) {
      const c = await db();
      const data = ok(
        await c.from("users").select("*").eq("email", email.trim().toLowerCase()).maybeSingle(),
      );
      return data ? fromRow(userSchema, data) : null;
    },
    async listByIds(ids) {
      const c = await db();
      const found = await Promise.all(
        chunk(ids).map(async (part) => rows(await c.from("users").select("*").in("id", part))),
      );
      return fromRows(userSchema, found.flat());
    },
    async listPlatformStaff() {
      const c = await db();
      const data = rows(
        await c.from("users").select("*").not("platform_role", "is", null).order("created_at"),
      );
      return fromRows(userSchema, data);
    },
    async create(input) {
      if (!input.id) throw new Error("Supabase users.create needs the Auth user id");
      const c = await db();
      const data = one(
        await c
          .from("users")
          .insert({ ...toRow(input), email: input.email.trim().toLowerCase() })
          .select()
          .single(),
        { conflict: "userExists" },
      );
      return fromRow(userSchema, data);
    },
    async update(id, patch) {
      const c = await db();
      const values = toRow(patch);
      if (Object.keys(values).length === 0) {
        const current = ok(await c.from("users").select("*").eq("id", id).maybeSingle());
        if (!current) throw notFoundError("User");
        return fromRow(userSchema, current);
      }
      const data = ok(await c.from("users").update(values).eq("id", id).select().maybeSingle());
      if (!data) throw notFoundError("User");
      return fromRow(userSchema, data);
    },
  };
}

export function supabaseMembershipRepository(db: DbGetter): MembershipRepository {
  return {
    async listByUser(userId) {
      const c = await db();
      return fromRows(
        membershipSchema,
        rows(await c.from("memberships").select("*").eq("user_id", userId).order("created_at")),
      );
    },
    async listByOrganization(organizationId) {
      const c = await db();
      return fromRows(
        membershipSchema,
        rows(
          await c.from("memberships").select("*").eq("organization_id", organizationId).order("created_at"),
        ),
      );
    },
    async find(userId, organizationId) {
      const c = await db();
      const data = ok(
        await c
          .from("memberships")
          .select("*")
          .eq("user_id", userId)
          .eq("organization_id", organizationId)
          .maybeSingle(),
      );
      return data ? fromRow(membershipSchema, data) : null;
    },
    async create(input) {
      const c = await db();
      const data = one(await c.from("memberships").insert(toRow(input)).select().single(), {
        conflict: "alreadyMember",
      });
      return fromRow(membershipSchema, data);
    },
    async updateRole(userId, organizationId, role) {
      const c = await db();
      const data = ok(
        await c
          .from("memberships")
          .update({ role })
          .eq("user_id", userId)
          .eq("organization_id", organizationId)
          .select()
          .maybeSingle(),
        { check: "lastOwner" },
      );
      if (!data) throw notFoundError("Membership");
      return fromRow(membershipSchema, data);
    },
    async delete(userId, organizationId) {
      const c = await db();
      const deleted = ok(
        await c
          .from("memberships")
          .delete()
          .eq("user_id", userId)
          .eq("organization_id", organizationId)
          .select("user_id"),
        { check: "lastOwner" },
      );
      if (!deleted || deleted.length === 0) throw notFoundError("Membership");
    },
  };
}

export function supabaseInvitationRepository(db: DbGetter): InvitationRepository {
  /** The token hash never leaves the repository; the entity schema drops it. */
  return {
    async findById(id) {
      const c = await db();
      const data = ok(await c.from("invitations").select("*").eq("id", id).maybeSingle());
      return data ? fromRow(invitationSchema, data) : null;
    },
    async findByTokenHash(tokenHash) {
      const c = await db();
      const data = ok(await c.from("invitations").select("*").eq("token_hash", tokenHash).maybeSingle());
      return data ? fromRow(invitationSchema, data) : null;
    },
    async listByOrganization(organizationId) {
      const c = await db();
      return fromRows(
        invitationSchema,
        rows(
          await c.from("invitations").select("*").eq("organization_id", organizationId).order("created_at"),
        ),
      );
    },
    async create(input) {
      const c = await db();
      const data = one(
        await c
          .from("invitations")
          .insert({ ...toRow(input), email: input.email.trim().toLowerCase() })
          .select()
          .single(),
      );
      return fromRow(invitationSchema, data);
    },
    async markAccepted(id, acceptedAt) {
      const c = await db();
      const data = ok(
        await c.from("invitations").update({ accepted_at: acceptedAt }).eq("id", id).select().maybeSingle(),
      );
      if (!data) throw notFoundError("Invitation");
      return fromRow(invitationSchema, data);
    },
    async delete(id) {
      const c = await db();
      const deleted = ok(await c.from("invitations").delete().eq("id", id).select("id"));
      if (!deleted || deleted.length === 0) throw notFoundError("Invitation");
    },
  };
}
