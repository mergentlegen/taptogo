import "server-only";

import type { User } from "@/features/users/schemas";
import { PASSWORD_RESET_TTL_MINUTES, passwordResetEmail } from "@/server/emails/templates";
import { AppError } from "@/server/errors";
import type { EmailProvider } from "@/server/providers/email/types";
import type { Repositories } from "@/server/repositories";
import { ok, rows } from "@/server/repositories/supabase/support";
import type { RateLimiter, RateLimitRule } from "@/server/security/rate-limiter";
import type { AuditService } from "@/server/services/audit-service";
import type { Db } from "@/server/supabase/clients";

import { LOGIN_RULE } from "./mock-auth-service";
import { randomToken, sha256Hex } from "./session-token";
import { generateTemporaryPassword } from "./temporary-password";
import type {
  AcceptInvitationResult,
  AuthService,
  ClientInfo,
  Impersonation,
  InvitationPreview,
  IssuedSession,
  Session,
  SessionInfo,
  SessionUser,
  SignInResult,
} from "./types";

const HOUR = 60 * 60 * 1000;
/** Same limits as the mock: staff sessions are short, clients stay signed in for a week. */
const STAFF_SESSION_MS = 12 * HOUR;
const CLIENT_SESSION_MS = 7 * 24 * HOUR;

const RESET_EMAIL_RULE: RateLimitRule = { limit: 3, windowMs: HOUR };
const RESET_IP_RULE: RateLimitRule = { limit: 10, windowMs: HOUR };

export type SupabaseAuthDeps = {
  /** The signed-in user's client (their cookies). Sessions are read and ended through it. */
  userClient: () => Promise<Db>;
  /** A client with no session at all, for checking a password without touching the user's. */
  isolatedClient: () => Db;
  /** Secret-key client: admin API, tables without policies for users. */
  system: () => Db;
  /** Repositories on the system client (authentication has no user behind it yet). */
  repositories: Repositories;
  email: EmailProvider;
  rateLimiter: RateLimiter;
  audit: AuditService;
  clock: () => Date;
  appUrl: string;
};

const toSessionUser = ({ id, email, name, platformRole, mustChangePassword }: User): SessionUser => ({
  id,
  email,
  name,
  platformRole,
  mustChangePassword,
});

const sessionLifetime = (user: Pick<User, "platformRole">) =>
  user.platformRole ? STAFF_SESSION_MS : CLIENT_SESSION_MS;

/**
 * Authentication on Supabase Auth. Passwords, refresh tokens and the session
 * cookies belong to Supabase; the profile, roles and status stay in `public.users`.
 * Password reset links and invitations are our own tables, because the links are
 * sent by hand and must live as long as the app says, not as long as Auth's OTP.
 */
export class SupabaseAuthService implements AuthService {
  constructor(private readonly deps: SupabaseAuthDeps) {}

  async signIn(credentials: { email: string; password: string }, client: ClientInfo): Promise<SignInResult> {
    const { repositories, rateLimiter, audit } = this.deps;
    const email = credentials.email.trim().toLowerCase();
    const keys = [`login:email:${email}`, `login:ip:${client.ip ?? "unknown"}`];

    const limits = await Promise.all(keys.map((key) => rateLimiter.check(key, LOGIN_RULE)));
    if (limits.some((state) => !state.allowed)) {
      await audit.record({ actorUserId: null, action: "auth.sign_in_blocked", entityType: "user" });
      return { ok: false, reason: "RATE_LIMITED" };
    }

    // Writes the Supabase session cookies on success.
    const supabase = await this.deps.userClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: credentials.password });
    const user = data.user ? await repositories.users.findById(data.user.id) : null;

    if (error || !user || user.status !== "ACTIVE") {
      // A correct password for an account we do not let in must not leave a session behind.
      if (data.session) await supabase.auth.signOut({ scope: "local" });
      await Promise.all(keys.map((key) => rateLimiter.hit(key, LOGIN_RULE)));
      const blocked = Boolean(user && !error && user.status === "BLOCKED");
      await audit.record({
        actorUserId: null,
        action: "auth.sign_in_failed",
        entityType: "user",
        entityId: user?.id ?? null,
        after: { reason: blocked ? "blocked" : "invalid_credentials" },
      });
      return { ok: false, reason: blocked ? "BLOCKED" : "INVALID_CREDENTIALS" };
    }

    await rateLimiter.reset(`login:email:${email}`);
    const now = this.deps.clock();
    await repositories.users.update(user.id, { lastLoginAt: now.toISOString() });
    await audit.record({
      actorUserId: user.id,
      action: "auth.sign_in",
      entityType: "user",
      entityId: user.id,
    });
    return {
      ok: true,
      session: {
        token: null,
        expiresAt: new Date(now.getTime() + sessionLifetime(user)),
        user: toSessionUser(user),
      },
    };
  }

  async signOut(token: string | null): Promise<void> {
    void token; // Supabase keeps the session in its own cookies
    const supabase = await this.deps.userClient();
    const identity = await this.identity();
    // "local": only this device. The default would end every session of the user.
    await supabase.auth.signOut({ scope: "local" });
    if (!identity) return;
    await this.deps.audit.record({
      actorUserId: identity.userId,
      action: "auth.sign_out",
      entityType: "user",
      entityId: identity.userId,
    });
  }

  async getSession(): Promise<Session | null> {
    const identity = await this.identity({ verifyWithServer: true });
    if (!identity) return null;

    const { repositories, clock } = this.deps;
    const user = await repositories.users.findById(identity.userId);
    if (!user || user.status !== "ACTIVE") return null;

    const now = clock();
    const expiresAt = new Date(identity.startedAt.getTime() + sessionLifetime(user));
    if (expiresAt <= now) {
      await (await this.deps.userClient()).auth.signOut({ scope: "local" });
      return null;
    }

    return {
      id: identity.sessionId,
      user: toSessionUser(user),
      createdAt: identity.startedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      // Only staff can impersonate, so everyone else skips the extra query.
      impersonation: user.platformRole ? await this.activeImpersonation(identity.sessionId, now) : null,
    };
  }

  async listSessions(userId: string): Promise<SessionInfo[]> {
    void userId; // the function lists the signed-in user's sessions, whoever asks
    const supabase = await this.deps.userClient();
    const data = rows(await supabase.rpc("my_sessions"));
    return data.map((row) => ({
      id: row.id,
      createdAt: new Date(row.created_at).toISOString(),
      lastSeenAt: new Date(row.last_seen_at).toISOString(),
      expiresAt: new Date(
        row.expires_at ?? new Date(row.created_at).getTime() + CLIENT_SESSION_MS,
      ).toISOString(),
      userAgent: row.user_agent?.slice(0, 300) ?? null,
    }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const supabase = await this.deps.userClient();
    // The function only deletes sessions of the signed-in user.
    ok(await supabase.rpc("revoke_my_session", { p_session_id: sessionId }));
    await this.deps.audit.record({
      actorUserId: userId,
      action: "auth.session_revoke",
      entityType: "user",
      entityId: userId,
    });
  }

  async changePassword(input: {
    userId: string;
    currentSessionId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<{ ok: true } | { ok: false; reason: "WRONG_PASSWORD" | "RATE_LIMITED" }> {
    const { repositories, rateLimiter, audit } = this.deps;
    const key = `password-change:${input.userId}`;
    if (!(await rateLimiter.check(key, LOGIN_RULE)).allowed) return { ok: false, reason: "RATE_LIMITED" };

    const user = await repositories.users.findById(input.userId);
    if (!user || !(await this.passwordMatches(user.email, input.currentPassword))) {
      await rateLimiter.hit(key, LOGIN_RULE);
      return { ok: false, reason: "WRONG_PASSWORD" };
    }

    await this.setPassword(user.id, input.newPassword);
    await repositories.users.update(user.id, { mustChangePassword: false });
    // Auth ends every session of a user whose password was set through the admin API,
    // this device's too. Signing in again with the new password keeps the person
    // signed in here; anything else that survived is ended.
    const supabase = await this.deps.userClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: input.newPassword,
    });
    if (error) throw new Error(`Supabase Auth: ${error.code ?? "?"} ${error.message}`);
    const current = await this.identity();
    await this.revokeSessions(user.id, current?.sessionId ?? input.currentSessionId);
    await rateLimiter.reset(key);
    await audit.record({
      actorUserId: user.id,
      action: "auth.password_change",
      entityType: "user",
      entityId: user.id,
    });
    return { ok: true };
  }

  async requestPasswordReset(email: string, client: ClientInfo): Promise<void> {
    const { repositories, rateLimiter, audit } = this.deps;
    const normalized = email.trim().toLowerCase();
    const emailKey = `reset:email:${normalized}`;
    const ipKey = `reset:ip:${client.ip ?? "unknown"}`;
    const [byEmail, byIp] = await Promise.all([
      rateLimiter.check(emailKey, RESET_EMAIL_RULE),
      rateLimiter.check(ipKey, RESET_IP_RULE),
    ]);
    if (!byEmail.allowed || !byIp.allowed) return;
    await Promise.all([rateLimiter.hit(emailKey, RESET_EMAIL_RULE), rateLimiter.hit(ipKey, RESET_IP_RULE)]);

    const user = await repositories.users.findByEmail(normalized);
    if (!user || user.status !== "ACTIVE") return;

    const token = randomToken();
    ok(
      await this.deps
        .system()
        .from("password_reset_tokens")
        .insert({
          token_hash: await sha256Hex(token),
          user_id: user.id,
          expires_at: new Date(
            this.deps.clock().getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000,
          ).toISOString(),
        }),
    );

    const link = new URL(`/reset-password?token=${token}`, this.deps.appUrl).toString();
    await this.deps.email.send(passwordResetEmail({ to: user.email, name: user.name, link }));
    await audit.record({
      actorUserId: null,
      action: "auth.password_reset_request",
      entityType: "user",
      entityId: user.id,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<{ ok: boolean }> {
    const system = this.deps.system();
    const now = this.deps.clock().toISOString();
    const tokenHash = await sha256Hex(token);

    // One statement claims the token: of two simultaneous attempts only one gets the row.
    const claimed = ok(
      await system
        .from("password_reset_tokens")
        .update({ used_at: now })
        .eq("token_hash", tokenHash)
        .is("used_at", null)
        .gt("expires_at", now)
        .select("user_id")
        .maybeSingle(),
    );
    if (!claimed) return { ok: false };
    const userId = claimed.user_id;

    try {
      await this.setPassword(userId, newPassword);
    } catch {
      // The password was not changed (e.g. rejected by Auth): let the person use the link again.
      ok(await system.from("password_reset_tokens").update({ used_at: null }).eq("token_hash", tokenHash));
      return { ok: false };
    }
    // Any other outstanding link for this user stops working too.
    ok(
      await system
        .from("password_reset_tokens")
        .update({ used_at: now })
        .eq("user_id", userId)
        .is("used_at", null),
    );
    await this.deps.repositories.users.update(userId, { mustChangePassword: false });
    await this.revokeSessions(userId);
    await this.deps.audit.record({
      actorUserId: userId,
      action: "auth.password_reset",
      entityType: "user",
      entityId: userId,
    });
    return { ok: true };
  }

  async issueTemporaryPassword(userId: string): Promise<string | null> {
    const { repositories } = this.deps;
    const user = await repositories.users.findById(userId);
    if (!user) return null;
    const password = generateTemporaryPassword();
    await this.setPassword(user.id, password);
    await repositories.users.update(user.id, { mustChangePassword: true });
    await this.revokeSessions(user.id);
    return password;
  }

  async startImpersonation(sessionId: string, organizationId: string, ttlMs: number): Promise<Impersonation> {
    const identity = await this.identity();
    if (!identity || identity.sessionId !== sessionId) throw new Error("Session not found");

    const system = this.deps.system();
    const now = this.deps.clock();
    // One active view per session: close whatever was open before.
    ok(
      await system
        .from("impersonation_sessions")
        .update({ ended_at: now.toISOString() })
        .eq("auth_session_id", sessionId)
        .is("ended_at", null),
    );
    const impersonation = {
      organizationId,
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    ok(
      await system.from("impersonation_sessions").insert({
        staff_user_id: identity.userId,
        auth_session_id: sessionId,
        organization_id: organizationId,
        started_at: impersonation.startedAt,
        expires_at: impersonation.expiresAt,
      }),
    );
    return impersonation;
  }

  async stopImpersonation(sessionId: string): Promise<Impersonation | null> {
    const system = this.deps.system();
    const open = rows(
      await system
        .from("impersonation_sessions")
        .select("*")
        .eq("auth_session_id", sessionId)
        .is("ended_at", null)
        .order("started_at", { ascending: false }),
    );
    const latest = open[0];
    if (!latest) return null;
    ok(
      await system
        .from("impersonation_sessions")
        .update({ ended_at: this.deps.clock().toISOString() })
        .eq("auth_session_id", sessionId)
        .is("ended_at", null),
    );
    // Reported even if it had just expired, like the mock does.
    return {
      organizationId: latest.organization_id,
      startedAt: new Date(latest.started_at).toISOString(),
      expiresAt: new Date(latest.expires_at).toISOString(),
    };
  }

  async getInvitation(token: string): Promise<InvitationPreview | null> {
    const { repositories } = this.deps;
    const invitation = await repositories.invitations.findByTokenHash(await sha256Hex(token));
    if (!invitation) return null;
    const [organization, existing] = await Promise.all([
      repositories.organizations.findById(invitation.organizationId),
      repositories.users.findByEmail(invitation.email),
    ]);
    if (!organization) return null;

    return {
      email: invitation.email,
      organizationName: organization.name,
      role: invitation.role,
      status: invitation.acceptedAt
        ? "ACCEPTED"
        : invitation.expiresAt <= this.deps.clock().toISOString()
          ? "EXPIRED"
          : "PENDING",
      existingUser: existing !== null,
    };
  }

  async acceptInvitation(
    input: { token: string; name?: string; password?: string },
    client: ClientInfo,
  ): Promise<AcceptInvitationResult> {
    const { repositories, audit } = this.deps;
    void client;
    const now = this.deps.clock().toISOString();
    const invitation = await repositories.invitations.findByTokenHash(await sha256Hex(input.token));
    if (!invitation) return { ok: false, reason: "INVALID_TOKEN" };
    if (invitation.acceptedAt) return { ok: false, reason: "ALREADY_ACCEPTED" };
    if (invitation.expiresAt <= now) return { ok: false, reason: "EXPIRED" };

    let user = await repositories.users.findByEmail(invitation.email);
    let session: IssuedSession | null = null;

    if (!user) {
      if (!input.name || !input.password) return { ok: false, reason: "PASSWORD_REQUIRED" };
      user = await this.createUser({
        email: invitation.email,
        name: input.name,
        password: input.password,
        lastLoginAt: now,
      });
    }

    if (!(await repositories.memberships.find(user.id, invitation.organizationId))) {
      try {
        await repositories.memberships.create({
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        });
      } catch (error) {
        // Two simultaneous acceptances: the other one already added the membership.
        if (!(error instanceof AppError && error.code === "CONFLICT")) throw error;
      }
    }
    await repositories.invitations.markAccepted(invitation.id, now);
    await audit.record({
      actorUserId: user.id,
      action: "invitation.accept",
      entityType: "invitation",
      entityId: invitation.id,
      organizationId: invitation.organizationId,
      after: { role: invitation.role },
    });

    // A brand-new person is signed in right away; someone who already had an account signs in as usual.
    if (input.password && input.name) {
      const supabase = await this.deps.userClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: input.password,
      });
      if (!error && data.session) {
        session = {
          token: null,
          expiresAt: new Date(this.deps.clock().getTime() + sessionLifetime(user)),
          user: toSessionUser(user),
        };
      }
    }
    return { ok: true, organizationId: invitation.organizationId, session };
  }

  // ── internals ───────────────────────────────────────────────────────────

  /**
   * Who is signed in on this request, from the Supabase cookies. `verifyWithServer`
   * also asks Auth whether the session still exists, so a session that was ended
   * (password change, "sign out everywhere") stops working at once instead of
   * living until its access token expires.
   */
  private async identity(options: { verifyWithServer?: boolean } = {}) {
    const supabase = await this.deps.userClient();
    const { data: claimsData } = await supabase.auth.getClaims();
    const claims = claimsData?.claims;
    if (!claims?.sub || typeof claims.session_id !== "string") return null;

    if (options.verifyWithServer) {
      const { data, error } = await supabase.auth.getUser();
      if (error || data.user?.id !== claims.sub) return null;
    }

    // `amr` lists when each sign-in method was used for this session: the first entry is
    // the sign-in itself and does not change when the access token is refreshed.
    const first = claims.amr?.[0];
    const signedInAt = typeof first === "object" ? first.timestamp : claims.iat;
    return {
      userId: claims.sub,
      sessionId: claims.session_id,
      startedAt: new Date((typeof signedInAt === "number" ? signedInAt : 0) * 1000),
    };
  }

  private async activeImpersonation(sessionId: string, now: Date): Promise<Impersonation | null> {
    const row = ok(
      await this.deps
        .system()
        .from("impersonation_sessions")
        .select("*")
        .eq("auth_session_id", sessionId)
        .is("ended_at", null)
        .gt("expires_at", now.toISOString())
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    return row
      ? {
          organizationId: row.organization_id,
          startedAt: new Date(row.started_at).toISOString(),
          expiresAt: new Date(row.expires_at).toISOString(),
        }
      : null;
  }

  /** Checks a password without touching the user's own session. */
  private async passwordMatches(email: string, password: string): Promise<boolean> {
    const isolated = this.deps.isolatedClient();
    const { data, error } = await isolated.auth.signInWithPassword({ email, password });
    if (error || !data.session) return false;
    await isolated.auth.signOut({ scope: "local" });
    return true;
  }

  private async setPassword(userId: string, password: string): Promise<void> {
    const { error } = await this.deps.system().auth.admin.updateUserById(userId, { password });
    if (error) throw new Error(`Supabase Auth: ${error.code ?? "?"} ${error.message}`);
  }

  /** Ends the user's sessions on every device, optionally keeping one. */
  private async revokeSessions(userId: string, exceptSessionId?: string): Promise<void> {
    ok(
      await this.deps
        .system()
        .rpc("revoke_user_sessions", { p_user_id: userId, p_except_session_id: exceptSessionId }),
    );
  }

  /** An Auth account plus its profile; neither is left behind if the other fails. */
  private async createUser(input: {
    email: string;
    name: string;
    password: string;
    lastLoginAt: string;
  }): Promise<User> {
    const system = this.deps.system();
    const { data, error } = await system.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`Supabase Auth: ${error?.code ?? "?"} ${error?.message ?? ""}`);

    try {
      return await this.deps.repositories.users.create({
        id: data.user.id,
        email: input.email,
        name: input.name,
        phone: null,
        platformRole: null,
        status: "ACTIVE",
        totpEnabled: false,
        mustChangePassword: false,
        lastLoginAt: input.lastLoginAt,
      });
    } catch (failure) {
      await system.auth.admin.deleteUser(data.user.id);
      throw failure;
    }
  }
}
