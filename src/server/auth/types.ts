import type { OrgRole } from "@/features/team/schemas";
import type { User } from "@/features/users/schemas";

export type SessionUser = Pick<User, "id" | "email" | "name" | "platformRole" | "mustChangePassword">;

export type Impersonation = {
  organizationId: string;
  startedAt: string;
  expiresAt: string;
};

export type Session = {
  id: string;
  user: SessionUser;
  createdAt: string;
  expiresAt: string;
  /** Staff viewing a client cabinet read-only (stage 6). */
  impersonation: Impersonation | null;
};

/** Request facts used for rate limiting and the sessions list. Never stored raw beyond that. */
export type ClientInfo = { ip: string | null; userAgent: string | null };

/**
 * `token` is the value of the app's own session cookie (mock data source). It is
 * null when the auth backend keeps the session in its own cookies (Supabase Auth
 * writes them while signing in), so there is nothing for the app to set.
 */
export type IssuedSession = { token: string | null; expiresAt: Date; user: SessionUser };

export type SignInFailure = "INVALID_CREDENTIALS" | "RATE_LIMITED" | "BLOCKED";
export type SignInResult = { ok: true; session: IssuedSession } | { ok: false; reason: SignInFailure };

export type SessionInfo = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
};

export type InvitationPreview = {
  email: string;
  organizationName: string;
  role: OrgRole;
  status: "PENDING" | "EXPIRED" | "ACCEPTED";
  /** An account with this email exists: accepting only adds the membership. */
  existingUser: boolean;
};

export type AcceptInvitationResult =
  | { ok: true; organizationId: string; session: IssuedSession | null }
  | { ok: false; reason: "INVALID_TOKEN" | "EXPIRED" | "ALREADY_ACCEPTED" | "PASSWORD_REQUIRED" };

/**
 * Authentication contract. MockAuthService implements it now; a Supabase Auth
 * implementation replaces it later without touching pages or actions.
 */
export interface AuthService {
  signIn(credentials: { email: string; password: string }, client: ClientInfo): Promise<SignInResult>;
  /** Ends the current session. `token` is the app's session cookie, if the backend uses one. */
  signOut(token: string | null): Promise<void>;
  /**
   * The session of the current request; null when missing, forged, expired or revoked.
   * `token` is the app's session cookie, if the backend uses one (Supabase reads its own cookies).
   */
  getSession(token: string | null): Promise<Session | null>;
  listSessions(userId: string): Promise<SessionInfo[]>;
  revokeSession(userId: string, sessionId: string): Promise<void>;
  /** Always resolves, whether or not the email exists (no account enumeration). */
  requestPasswordReset(email: string, client: ClientInfo): Promise<void>;
  /** Requires the current password; other sessions of the user are ended, the current one stays. */
  changePassword(input: {
    userId: string;
    currentSessionId: string;
    currentPassword: string;
    newPassword: string;
  }): Promise<{ ok: true } | { ok: false; reason: "WRONG_PASSWORD" | "RATE_LIMITED" }>;
  /** One-time token from the email; on success every session of the user is revoked. */
  resetPassword(token: string, newPassword: string): Promise<{ ok: boolean }>;
  getInvitation(token: string): Promise<InvitationPreview | null>;
  /**
   * Generates a temporary password, sets it and ends every session of the user.
   * The user must change it at the next sign-in. Returns null when there is no such user.
   */
  issueTemporaryPassword(userId: string): Promise<string | null>;
  /** Read-only view of a client cabinet for platform staff; ends by itself after `ttlMs`. */
  startImpersonation(sessionId: string, organizationId: string, ttlMs: number): Promise<Impersonation>;
  /** Returns the impersonation that was active (even if it had just expired), or null. */
  stopImpersonation(sessionId: string): Promise<Impersonation | null>;
  acceptInvitation(
    input: { token: string; name?: string; password?: string },
    client: ClientInfo,
  ): Promise<AcceptInvitationResult>;
}
