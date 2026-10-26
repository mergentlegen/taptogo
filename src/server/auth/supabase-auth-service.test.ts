/**
 * Integration tests of SupabaseAuthService against a REAL project (see the note in
 * supabase-repositories.test.ts: they run when the Supabase keys are in .env.local and
 * clean up after themselves). Every "device" is its own client with its own session.
 * Audit writes are replaced by a no-op: `audit_logs` is append-only, so a real run would
 * leave rows behind forever.
 */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { SupabaseOutbox } from "@/server/providers/email/supabase-outbox";
import { createSupabaseRepositories } from "@/server/repositories/supabase";
import { InMemoryRateLimiter } from "@/server/security/rate-limiter";
import { AuditService } from "@/server/services/audit-service";
import type { Db } from "@/server/supabase/clients";
import type { Database } from "@/server/supabase/database.types";

import { sha256Hex } from "./session-token";
import { SupabaseAuthService } from "./supabase-auth-service";
import type { ClientInfo } from "./types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: the suite below is skipped
}

// Each test makes several round trips to the hosted project.
vi.setConfig({ testTimeout: 30_000 });

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = process.env;
const configured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && SUPABASE_SECRET_KEY);

const run = crypto.randomUUID().slice(0, 8);
const PASSWORD = `Pw-${crypto.randomUUID()}`;
const NEW_PASSWORD = `New-${crypto.randomUUID()}`;
const client: ClientInfo = { ip: "203.0.113.7", userAgent: "vitest" };
const noAudit = new AuditService({
  append: async (entry) => ({ ...entry, id: crypto.randomUUID(), createdAt: new Date().toISOString() }),
  appendMany: async () => {},
  list: async () => ({ items: [], nextCursor: null }),
});

describe.skipIf(!configured)("SupabaseAuthService (real project)", () => {
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const newClient = () => createClient<Database>(SUPABASE_URL!, SUPABASE_PUBLISHABLE_KEY!, options);

  let system: Db;
  let repositories: ReturnType<typeof createSupabaseRepositories>;
  let outbox: SupabaseOutbox;
  const authIds: string[] = [];
  const orgIds: string[] = [];
  const emails: string[] = [];

  /** A "device": its own cookie jar (a client with its own session) and the service on top of it. */
  function device() {
    const jar = newClient();
    const service = new SupabaseAuthService({
      userClient: async () => jar,
      isolatedClient: newClient,
      system: () => system,
      repositories,
      email: outbox,
      rateLimiter: new InMemoryRateLimiter(() => new Date()),
      audit: noAudit,
      clock: () => new Date(),
      appUrl: "http://localhost:3000",
    });
    return { jar, service };
  }

  async function createUser(label: string, platformRole: "ADMIN" | null = null) {
    const email = `a-${run}-${label}@example.kz`;
    emails.push(email);
    const { data, error } = await system.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    authIds.push(data.user.id);
    await repositories.users.create({
      id: data.user.id,
      email,
      name: `Пользователь ${label}`,
      phone: null,
      platformRole,
      status: "ACTIVE",
      totpEnabled: false,
      mustChangePassword: false,
      lastLoginAt: null,
    });
    return { id: data.user.id, email };
  }

  async function createOrganization(name: string) {
    const { organization } = await repositories.organizations.createClient({
      organization: {
        name,
        contactName: "Тест",
        contactPhone: "+77001112233",
        contactEmail: `o-${run}@example.kz`,
        timezone: "Asia/Almaty",
        status: "ACTIVE",
      },
      locations: [],
    });
    orgIds.push(organization.id);
    return organization;
  }

  beforeAll(() => {
    system = createClient<Database>(SUPABASE_URL!, SUPABASE_SECRET_KEY!, options);
    repositories = createSupabaseRepositories(async () => system);
    outbox = new SupabaseOutbox(() => system);
  });

  afterAll(async () => {
    if (!system) return;
    if (orgIds.length) await system.from("organizations").delete().in("id", orgIds);
    for (const email of emails) await system.from("outbox_messages").delete().eq("to_address", email);
    for (const id of authIds) await system.auth.admin.deleteUser(id);
  }, 60_000);

  describe("signing in and out", () => {
    it("rejects wrong credentials with one generic answer", async () => {
      const user = await createUser("generic");
      const wrong = await device().service.signIn({ email: user.email, password: "wrong-password" }, client);
      const unknown = await device().service.signIn(
        { email: `nobody-${run}@example.kz`, password: PASSWORD },
        client,
      );

      expect(wrong).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
      expect(unknown).toEqual(wrong);
    });

    it("signs in, keeps the session across requests and signs out", async () => {
      const user = await createUser("session");
      const { service } = device();
      expect(await service.getSession()).toBeNull();

      const result = await service.signIn({ email: user.email.toUpperCase(), password: PASSWORD }, client);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.session.token).toBeNull();
      expect(result.session.user).toMatchObject({
        id: user.id,
        email: user.email,
        mustChangePassword: false,
      });

      const session = await service.getSession();
      expect(session?.user.id).toBe(user.id);
      expect(session?.impersonation).toBeNull();
      expect(session?.id).toMatch(/^[0-9a-f-]{36}$/);
      // A client's session lasts a week from the moment of sign-in.
      const lifetime = new Date(session!.expiresAt).getTime() - new Date(session!.createdAt).getTime();
      expect(lifetime).toBe(7 * 24 * 3_600_000);
      expect(Date.now() - new Date(session!.createdAt).getTime()).toBeLessThan(60_000);
      expect((await repositories.users.findById(user.id))?.lastLoginAt).not.toBeNull();

      await service.signOut(null);
      expect(await service.getSession()).toBeNull();
    });

    it("lets a blocked account in no further than the front door", async () => {
      const user = await createUser("blocked");
      await repositories.users.update(user.id, { status: "BLOCKED" });
      const { service } = device();

      expect(await service.signIn({ email: user.email, password: PASSWORD }, client)).toEqual({
        ok: false,
        reason: "BLOCKED",
      });
      expect(await service.getSession()).toBeNull();
    });

    it("stops after too many failed attempts", async () => {
      const user = await createUser("limit");
      const { service } = device();
      for (let i = 0; i < 5; i++) {
        await service.signIn(
          { email: user.email, password: "wrong-password" },
          { ip: "198.51.100.9", userAgent: null },
        );
      }
      expect(
        await service.signIn(
          { email: user.email, password: PASSWORD },
          { ip: "198.51.100.10", userAgent: null },
        ),
      ).toEqual({
        ok: false,
        reason: "RATE_LIMITED",
      });
    });
  });

  describe("sessions", () => {
    it("lists devices and ends one of them at once", async () => {
      const user = await createUser("devices");
      const phone = device();
      const laptop = device();
      for (const d of [phone, laptop]) {
        expect((await d.service.signIn({ email: user.email, password: PASSWORD }, client)).ok).toBe(true);
      }

      const sessions = await phone.service.listSessions(user.id);
      expect(sessions).toHaveLength(2);
      const laptopSession = (await laptop.service.getSession())!;
      expect(sessions.map((s) => s.id)).toContain(laptopSession.id);

      await phone.service.revokeSession(user.id, laptopSession.id);
      expect(await phone.service.listSessions(user.id)).toHaveLength(1);
      // The laptop's access token has not expired yet, but the session is gone: no access.
      expect(await laptop.service.getSession()).toBeNull();
      expect(await phone.service.getSession()).not.toBeNull();
    });
  });

  describe("passwords", () => {
    it("issues a temporary password that must be replaced before anything else", async () => {
      const user = await createUser("temporary");
      const before = device();
      await before.service.signIn({ email: user.email, password: PASSWORD }, client);
      const { service } = device();

      const temporary = await service.issueTemporaryPassword(user.id);
      expect(temporary).toMatch(/^[A-Za-z0-9]{12}$/);
      expect(await service.issueTemporaryPassword(crypto.randomUUID())).toBeNull();
      expect(await before.service.getSession()).toBeNull();
      expect((await service.signIn({ email: user.email, password: PASSWORD }, client)).ok).toBe(false);

      const result = await service.signIn({ email: user.email, password: temporary! }, client);
      expect(result.ok && result.session.user.mustChangePassword).toBe(true);
      const session = (await service.getSession())!;
      expect(session.user.mustChangePassword).toBe(true);

      expect(
        await service.changePassword({
          userId: user.id,
          currentSessionId: session.id,
          currentPassword: "not-the-password",
          newPassword: NEW_PASSWORD,
        }),
      ).toEqual({ ok: false, reason: "WRONG_PASSWORD" });
      expect(
        await service.changePassword({
          userId: user.id,
          currentSessionId: session.id,
          currentPassword: temporary!,
          newPassword: NEW_PASSWORD,
        }),
      ).toEqual({ ok: true });

      // The current session stays and is now complete; the new password works, the old ones do not.
      expect((await service.getSession())?.user.mustChangePassword).toBe(false);
      const again = device();
      expect((await again.service.signIn({ email: user.email, password: temporary! }, client)).ok).toBe(
        false,
      );
      expect((await again.service.signIn({ email: user.email, password: NEW_PASSWORD }, client)).ok).toBe(
        true,
      );
    });

    it("resets a forgotten password with a one-time link", async () => {
      const user = await createUser("reset");
      const open = device();
      await open.service.signIn({ email: user.email, password: PASSWORD }, client);
      const { service } = device();

      // Same answer for a stranger, and nothing is queued for them.
      await service.requestPasswordReset(`stranger-${run}@example.kz`, client);
      expect((await outbox.list()).some((m) => m.to.includes(`stranger-${run}`))).toBe(false);

      await service.requestPasswordReset(user.email.toUpperCase(), { ip: "192.0.2.1", userAgent: null });
      const message = (await outbox.list()).find((m) => m.to === user.email);
      expect(message?.tag).toBe("password_reset");
      const token = new URL(/https?:\/\/\S+/.exec(message!.text)![0]).searchParams.get("token")!;

      expect(await service.resetPassword("not-a-token", NEW_PASSWORD)).toEqual({ ok: false });
      expect(await service.resetPassword(token, NEW_PASSWORD)).toEqual({ ok: true });
      expect(await service.resetPassword(token, `${NEW_PASSWORD}x`)).toEqual({ ok: false });

      expect(await open.service.getSession()).toBeNull();
      const fresh = device();
      expect((await fresh.service.signIn({ email: user.email, password: PASSWORD }, client)).ok).toBe(false);
      expect((await fresh.service.signIn({ email: user.email, password: NEW_PASSWORD }, client)).ok).toBe(
        true,
      );
    });

    it("refuses an expired reset link", async () => {
      const user = await createUser("expired");
      const token = crypto.randomUUID();
      await system.from("password_reset_tokens").insert({
        token_hash: await sha256Hex(token),
        user_id: user.id,
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      });

      expect(await device().service.resetPassword(token, NEW_PASSWORD)).toEqual({ ok: false });
      expect((await device().service.signIn({ email: user.email, password: PASSWORD }, client)).ok).toBe(
        true,
      );
    });
  });

  describe("invitations", () => {
    async function invite(email: string, organizationId: string, token: string) {
      emails.push(email);
      return repositories.invitations.create({
        email,
        organizationId,
        role: "MANAGER",
        invitedById: null,
        expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
        acceptedAt: null,
        tokenHash: await sha256Hex(token),
      });
    }

    it("creates an account for a new person, signs them in and joins the organization", async () => {
      const organization = await createOrganization(`Приглашение ${run}`);
      const email = `new-${run}@example.kz`;
      const token = `token-${crypto.randomUUID()}`;
      await invite(email, organization.id, token);
      const { service } = device();

      expect(await service.getInvitation(token)).toMatchObject({
        email,
        organizationName: organization.name,
        status: "PENDING",
        existingUser: false,
      });
      expect(await service.getInvitation("no-such-token")).toBeNull();
      expect(await service.acceptInvitation({ token }, client)).toEqual({
        ok: false,
        reason: "PASSWORD_REQUIRED",
      });

      const result = await service.acceptInvitation(
        { token, name: "Новый Человек", password: PASSWORD },
        client,
      );
      expect(result.ok && result.organizationId).toBe(organization.id);
      expect(result.ok && result.session?.user.email).toBe(email);
      const user = (await repositories.users.findByEmail(email))!;
      authIds.push(user.id);
      expect((await service.getSession())?.user.id).toBe(user.id);
      expect((await repositories.memberships.find(user.id, organization.id))?.role).toBe("MANAGER");

      expect(await service.acceptInvitation({ token, name: "Ещё раз", password: PASSWORD }, client)).toEqual({
        ok: false,
        reason: "ALREADY_ACCEPTED",
      });
      expect((await service.getInvitation(token))?.status).toBe("ACCEPTED");
    });

    it("adds a membership for someone who already has an account", async () => {
      const organization = await createOrganization(`Второй ${run}`);
      const user = await createUser("existing");
      const token = `token-${crypto.randomUUID()}`;
      await invite(user.email, organization.id, token);
      const { service } = device();

      expect((await service.getInvitation(token))?.existingUser).toBe(true);
      const result = await service.acceptInvitation({ token }, client);
      expect(result).toEqual({ ok: true, organizationId: organization.id, session: null });
      expect(await repositories.memberships.find(user.id, organization.id)).not.toBeNull();
    });

    it("refuses an expired invitation", async () => {
      const organization = await createOrganization(`Просрочено ${run}`);
      const token = `token-${crypto.randomUUID()}`;
      const email = `late-${run}@example.kz`;
      await repositories.invitations.create({
        email,
        organizationId: organization.id,
        role: "OWNER",
        invitedById: null,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        acceptedAt: null,
        tokenHash: await sha256Hex(token),
      });
      expect((await device().service.getInvitation(token))?.status).toBe("EXPIRED");
      expect(
        await device().service.acceptInvitation({ token, name: "Поздно", password: PASSWORD }, client),
      ).toEqual({
        ok: false,
        reason: "EXPIRED",
      });
      expect(await repositories.users.findByEmail(email)).toBeNull();
    });
  });

  describe("staff viewing a client's cabinet", () => {
    it("starts and stops a read-only view tied to the session", async () => {
      const staff = await createUser("staff", "ADMIN");
      const organization = await createOrganization(`Просмотр ${run}`);
      const { service } = device();
      await service.signIn({ email: staff.email, password: PASSWORD }, client);
      const session = (await service.getSession())!;
      expect(session.user.platformRole).toBe("ADMIN");
      // Staff sessions are shorter.
      expect(new Date(session.expiresAt).getTime() - new Date(session.createdAt).getTime()).toBe(
        12 * 3_600_000,
      );

      const started = await service.startImpersonation(session.id, organization.id, 30 * 60_000);
      expect((await service.getSession())?.impersonation).toEqual(started);

      expect(await service.stopImpersonation(session.id)).toEqual(started);
      expect((await service.getSession())?.impersonation).toBeNull();
      expect(await service.stopImpersonation(session.id)).toBeNull();
      await expect(service.startImpersonation(crypto.randomUUID(), organization.id, 1000)).rejects.toThrow();
    });
  });
});
