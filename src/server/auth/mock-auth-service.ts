import { timingSafeEqual } from "node:crypto";

import type { User } from "@/features/users/schemas";
import { PASSWORD_RESET_TTL_MINUTES, passwordResetEmail } from "@/server/emails/templates";
import type { EmailProvider } from "@/server/providers/email/types";
import type { Repositories } from "@/server/repositories";
import type { RateLimiter, RateLimitRule } from "@/server/security/rate-limiter";
import type { AuditService } from "@/server/services/audit-service";

import { hashPassword, verifyPassword } from "./password-hash";
import { randomToken, sha256Hex, signSessionToken, verifySessionToken } from "./session-token";
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
/** Staff sessions are short; clients stay signed in for a week on their phone. */
const STAFF_SESSION_MS = 12 * HOUR;
const CLIENT_SESSION_MS = 7 * 24 * HOUR;
const LAST_SEEN_THROTTLE_MS = 60 * 1000;

export const LOGIN_RULE: RateLimitRule = { limit: 5, windowMs: 15 * 60 * 1000 };
const RESET_EMAIL_RULE: RateLimitRule = { limit: 3, windowMs: HOUR };
const RESET_IP_RULE: RateLimitRule = { limit: 10, windowMs: HOUR };

type StoredSession = SessionInfo & {
  userId: string;
  revokedAt: string | null;
  impersonation: Impersonation | null;
};
type ResetToken = { tokenHash: string; userId: string; expiresAt: string; usedAt: string | null };

export type MockAuthDeps = {
  repositories: Repositories;
  email: EmailProvider;
  rateLimiter: RateLimiter;
  audit: AuditService;
  clock: () => Date;
  sessionSecret: string;
  appUrl: string;
  /** Accepted for seeded users without a stored password. null disables it. */
  demoPassword: string | null;
  /** Users the demo password applies to (the seeded ones); runtime-created users never get it. */
  demoUserIds: ReadonlySet<string>;
};

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const toSessionUser = ({ id, email, name, platformRole, mustChangePassword }: User): SessionUser => ({
  id,
  email,
  name,
  platformRole,
  mustChangePassword,
});

/**
 * In-memory authentication for the mock data source. Mirrors what Supabase
 * Auth will provide: password sign-in, revocable sessions, one-time reset
 * links and invitation acceptance.
 */
export class MockAuthService implements AuthService {
  private readonly passwordHashes = new Map<string, string>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly resetTokens = new Map<string, ResetToken>();
  private dummyHash: Promise<string> | null = null;

  constructor(private readonly deps: MockAuthDeps) {}

  async signIn(credentials: { email: string; password: string }, client: ClientInfo): Promise<SignInResult> {
    const { repositories, rateLimiter, audit } = this.deps;
    const email = credentials.email.trim().toLowerCase();
    const keys = [`login:email:${email}`, `login:ip:${client.ip ?? "unknown"}`];

    const limits = await Promise.all(keys.map((key) => rateLimiter.check(key, LOGIN_RULE)));
    if (limits.some((state) => !state.allowed)) {
      await audit.record({ actorUserId: null, action: "auth.sign_in_blocked", entityType: "user" });
      return { ok: false, reason: "RATE_LIMITED" };
    }

    const user = await repositories.users.findByEmail(email);
    const passwordOk = await this.checkPassword(user, credentials.password);

    if (!user || !passwordOk || user.status !== "ACTIVE") {
      await Promise.all(keys.map((key) => rateLimiter.hit(key, LOGIN_RULE)));
      const blocked = Boolean(user && passwordOk && user.status === "BLOCKED");
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
    const session = await this.issueSession(user, client);
    await repositories.users.update(user.id, { lastLoginAt: this.now().toISOString() });
    await audit.record({
      actorUserId: user.id,
      action: "auth.sign_in",
      entityType: "user",
      entityId: user.id,
    });
    return { ok: true, session };
  }

  /** Development shortcut behind the "Sign in as…" buttons. Not part of AuthService. */
  async signInAsDemo(email: string, client: ClientInfo): Promise<SignInResult> {
    if (this.deps.demoPassword === null) return { ok: false, reason: "INVALID_CREDENTIALS" };
    return this.signIn({ email, password: this.deps.demoPassword }, client);
  }

  async signOut(token: string | null): Promise<void> {
    if (!token) return;
    const verified = await verifySessionToken(token, this.deps.sessionSecret, this.now());
    const stored = verified ? this.sessions.get(verified.sessionId) : undefined;
    if (!stored || stored.revokedAt) return;
    stored.revokedAt = this.now().toISOString();
    await this.deps.audit.record({
      actorUserId: stored.userId,
      action: "auth.sign_out",
      entityType: "user",
      entityId: stored.userId,
    });
  }

  async issueTemporaryPassword(userId: string): Promise<string | null> {
    const { repositories } = this.deps;
    const user = await repositories.users.findById(userId);
    if (!user) return null;
    const password = generateTemporaryPassword();
    this.passwordHashes.set(user.id, await hashPassword(password));
    await repositories.users.update(user.id, { mustChangePassword: true });
    this.revokeAll(user.id);
    return password;
  }

  async getSession(token: string | null): Promise<Session | null> {
    if (!token) return null;
    const now = this.now();
    const verified = await verifySessionToken(token, this.deps.sessionSecret, now);
    const stored = verified ? this.sessions.get(verified.sessionId) : undefined;
    if (!stored || stored.revokedAt || stored.expiresAt <= now.toISOString()) return null;

    const user = await this.deps.repositories.users.findById(stored.userId);
    if (!user || user.status !== "ACTIVE") return null;

    if (now.getTime() - new Date(stored.lastSeenAt).getTime() > LAST_SEEN_THROTTLE_MS) {
      stored.lastSeenAt = now.toISOString();
    }
    return {
      id: stored.id,
      user: toSessionUser(user),
      createdAt: stored.createdAt,
      expiresAt: stored.expiresAt,
      // An expired impersonation simply stops applying; the admin is back to normal.
      impersonation:
        stored.impersonation && stored.impersonation.expiresAt > now.toISOString()
          ? stored.impersonation
          : null,
    };
  }

  async startImpersonation(sessionId: string, organizationId: string, ttlMs: number): Promise<Impersonation> {
    const stored = this.sessions.get(sessionId);
    if (!stored || stored.revokedAt) throw new Error("Session not found");
    const now = this.now();
    stored.impersonation = {
      organizationId,
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    };
    return { ...stored.impersonation };
  }

  async stopImpersonation(sessionId: string): Promise<Impersonation | null> {
    const stored = this.sessions.get(sessionId);
    const previous = stored?.impersonation ?? null;
    if (stored) stored.impersonation = null;
    return previous;
  }

  async listSessions(userId: string): Promise<SessionInfo[]> {
    const now = this.now().toISOString();
    return [...this.sessions.values()]
      .filter((s) => s.userId === userId && !s.revokedAt && s.expiresAt > now)
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .map(({ id, createdAt, lastSeenAt, expiresAt, userAgent }): SessionInfo => ({
        id,
        createdAt,
        lastSeenAt,
        expiresAt,
        userAgent,
      }));
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const stored = this.sessions.get(sessionId);
    if (!stored || stored.userId !== userId) return;
    stored.revokedAt = this.now().toISOString();
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
    if (!user || !(await this.checkPassword(user, input.currentPassword))) {
      await rateLimiter.hit(key, LOGIN_RULE);
      return { ok: false, reason: "WRONG_PASSWORD" };
    }

    this.passwordHashes.set(user.id, await hashPassword(input.newPassword));
    await repositories.users.update(user.id, { mustChangePassword: false });
    const now = this.now().toISOString();
    for (const session of this.sessions.values()) {
      if (session.userId === user.id && session.id !== input.currentSessionId && !session.revokedAt) {
        session.revokedAt = now;
      }
    }
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
    const tokenHash = await sha256Hex(token);
    this.resetTokens.set(tokenHash, {
      tokenHash,
      userId: user.id,
      expiresAt: new Date(this.now().getTime() + PASSWORD_RESET_TTL_MINUTES * 60_000).toISOString(),
      usedAt: null,
    });

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
    const now = this.now().toISOString();
    const record = this.resetTokens.get(await sha256Hex(token));
    if (!record || record.usedAt || record.expiresAt <= now) return { ok: false };

    record.usedAt = now;
    // Any other outstanding link for this user stops working too.
    for (const other of this.resetTokens.values()) {
      if (other.userId === record.userId && !other.usedAt) other.usedAt = now;
    }
    this.passwordHashes.set(record.userId, await hashPassword(newPassword));
    await this.deps.repositories.users.update(record.userId, { mustChangePassword: false });
    this.revokeAll(record.userId);
    await this.deps.audit.record({
      actorUserId: record.userId,
      action: "auth.password_reset",
      entityType: "user",
      entityId: record.userId,
    });
    return { ok: true };
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
        : invitation.expiresAt <= this.now().toISOString()
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
    const now = this.now().toISOString();
    const invitation = await repositories.invitations.findByTokenHash(await sha256Hex(input.token));
    if (!invitation) return { ok: false, reason: "INVALID_TOKEN" };
    if (invitation.acceptedAt) return { ok: false, reason: "ALREADY_ACCEPTED" };
    if (invitation.expiresAt <= now) return { ok: false, reason: "EXPIRED" };

    let user = await repositories.users.findByEmail(invitation.email);
    let session: IssuedSession | null = null;

    if (!user) {
      if (!input.name || !input.password) return { ok: false, reason: "PASSWORD_REQUIRED" };
      user = await repositories.users.create({
        email: invitation.email,
        name: input.name,
        phone: null,
        platformRole: null,
        status: "ACTIVE",
        totpEnabled: false,
        mustChangePassword: false,
        lastLoginAt: now,
      });
      this.passwordHashes.set(user.id, await hashPassword(input.password));
      session = await this.issueSession(user, client);
    }

    if (!(await repositories.memberships.find(user.id, invitation.organizationId))) {
      await repositories.memberships.create({
        userId: user.id,
        organizationId: invitation.organizationId,
        role: invitation.role,
      });
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
    return { ok: true, organizationId: invitation.organizationId, session };
  }

  // ── internals ───────────────────────────────────────────────────────────

  private now(): Date {
    return this.deps.clock();
  }

  /** Always does the same expensive work, so response time doesn't reveal whether the email exists. */
  private async checkPassword(user: User | null, password: string): Promise<boolean> {
    const stored = user ? this.passwordHashes.get(user.id) : undefined;
    if (stored) return verifyPassword(password, stored);

    this.dummyHash ??= hashPassword(randomToken());
    await verifyPassword(password, await this.dummyHash);
    const demo = this.deps.demoPassword;
    return user !== null && demo !== null && this.deps.demoUserIds.has(user.id) && sameString(password, demo);
  }

  private async issueSession(user: User, client: ClientInfo): Promise<IssuedSession> {
    const now = this.now();
    const expiresAt = new Date(now.getTime() + (user.platformRole ? STAFF_SESSION_MS : CLIENT_SESSION_MS));
    const id = randomToken();
    this.sessions.set(id, {
      id,
      userId: user.id,
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      userAgent: client.userAgent?.slice(0, 300) ?? null,
      revokedAt: null,
      impersonation: null,
    });
    return {
      token: await signSessionToken(id, expiresAt, this.deps.sessionSecret),
      expiresAt,
      user: toSessionUser(user),
    };
  }

  private revokeAll(userId: string) {
    const now = this.now().toISOString();
    for (const session of this.sessions.values()) {
      if (session.userId === userId && !session.revokedAt) session.revokedAt = now;
    }
  }
}
