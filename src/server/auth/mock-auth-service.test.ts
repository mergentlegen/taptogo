import { beforeEach, describe, expect, it } from "vitest";

import { createSeedData, DEMO_INVITATION_TOKEN, DEMO_PASSWORD, sha256 } from "@/mocks/seed";
import { createMockContainer, type Container } from "@/server/container";

import { randomToken } from "./session-token";
import type { ClientInfo } from "./types";

const START = new Date("2026-10-17T10:00:00Z").getTime();
const MINUTE = 60_000;
const client: ClientInfo = { ip: "203.0.113.7", userAgent: "Vitest" };

let now: number;
let container: Container;

beforeEach(() => {
  now = START;
  container = createMockContainer(createSeedData({ now: new Date(START) }), () => new Date(now));
});

const signIn = (email: string, password: string, from = client) =>
  container.auth.signIn({ email, password }, from);

async function signedInToken(email = "owner@coffeepoint.kz"): Promise<string> {
  const result = await signIn(email, DEMO_PASSWORD);
  if (!result.ok) throw new Error(`sign-in failed: ${result.reason}`);
  return result.session.token;
}

function lastEmailLink(): string {
  const text = container.outbox?.list()[0]?.text ?? "";
  const link = /https?:\/\/\S+/.exec(text)?.[0];
  if (!link) throw new Error("no link in email");
  return link;
}

describe("sign in", () => {
  it("accepts the demo password and creates a working session", async () => {
    const result = await signIn("Owner@CoffeePoint.kz", DEMO_PASSWORD);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const session = await container.auth.getSession(result.session.token);
    expect(session?.user.email).toBe("owner@coffeepoint.kz");
    expect(session?.user).not.toHaveProperty("status");

    const user = await container.repositories.users.findByEmail("owner@coffeepoint.kz");
    expect(user?.lastLoginAt).toBe(new Date(START).toISOString());
    const { items } = await container.repositories.auditLogs.list({ action: "auth.sign_in" }, { limit: 1 });
    expect(items[0]?.actorUserId).toBe(user?.id);
  });

  it("answers identically for a wrong password and an unknown email", async () => {
    const wrongPassword = await signIn("owner@coffeepoint.kz", "not-the-password");
    const unknownEmail = await signIn("nobody@example.kz", DEMO_PASSWORD);

    expect(wrongPassword).toEqual({ ok: false, reason: "INVALID_CREDENTIALS" });
    expect(unknownEmail).toEqual(wrongPassword);
  });

  it("refuses blocked accounts", async () => {
    expect(await signIn("old.admin@taptogo.kz", DEMO_PASSWORD)).toEqual({ ok: false, reason: "BLOCKED" });
    expect(await signIn("old.admin@taptogo.kz", "wrong")).toEqual({
      ok: false,
      reason: "INVALID_CREDENTIALS",
    });
  });

  it("locks an account after 5 failures for 15 minutes, even with the right password", async () => {
    const otherIp = (n: number) => ({ ip: `198.51.100.${n}`, userAgent: null });
    for (let i = 0; i < 5; i++) await signIn("manager@coffeepoint.kz", "wrong", otherIp(i));

    expect(await signIn("manager@coffeepoint.kz", DEMO_PASSWORD, otherIp(9))).toEqual({
      ok: false,
      reason: "RATE_LIMITED",
    });
    now += 15 * MINUTE + 1;
    expect((await signIn("manager@coffeepoint.kz", DEMO_PASSWORD, otherIp(9))).ok).toBe(true);
  });

  it("limits attempts per IP across different emails", async () => {
    for (let i = 0; i < 5; i++) await signIn(`guess${i}@example.kz`, "wrong");
    expect(await signIn("owner@coffeepoint.kz", DEMO_PASSWORD)).toEqual({
      ok: false,
      reason: "RATE_LIMITED",
    });
  });
});

describe("sessions", () => {
  it("rejects forged and revoked tokens", async () => {
    const token = await signedInToken();
    const [id, exp] = token.split(".");

    expect(await container.auth.getSession(`${id}.${exp}.forged-signature`)).toBeNull();
    expect(await container.auth.getSession(`${randomToken()}.${exp}.x`)).toBeNull();

    await container.auth.signOut(token);
    expect(await container.auth.getSession(token)).toBeNull();
  });

  it("expires staff sessions after 12 hours and client sessions after 7 days", async () => {
    const staff = await signedInToken("admin@taptogo.kz");
    const owner = await signedInToken();

    now += 12 * 60 * MINUTE + 1;
    expect(await container.auth.getSession(staff)).toBeNull();
    expect(await container.auth.getSession(owner)).not.toBeNull();

    now = START + 7 * 24 * 60 * MINUTE + 1;
    expect(await container.auth.getSession(owner)).toBeNull();
  });

  it("drops sessions of users who get blocked", async () => {
    const token = await signedInToken("admin2@taptogo.kz");
    const user = await container.repositories.users.findByEmail("admin2@taptogo.kz");
    await container.repositories.users.update(user?.id ?? "", { status: "BLOCKED" });

    expect(await container.auth.getSession(token)).toBeNull();
  });

  it("lists and revokes a user's own sessions only", async () => {
    const first = await signedInToken();
    await signedInToken();
    const owner = await container.repositories.users.findByEmail("owner@coffeepoint.kz");
    const sessions = await container.auth.listSessions(owner?.id ?? "");
    expect(sessions).toHaveLength(2);

    const firstId = first.split(".")[0] ?? "";
    const manager = await container.repositories.users.findByEmail("manager@coffeepoint.kz");
    await container.auth.revokeSession(manager?.id ?? "", firstId);
    expect(await container.auth.getSession(first)).not.toBeNull();

    await container.auth.revokeSession(owner?.id ?? "", firstId);
    expect(await container.auth.getSession(first)).toBeNull();
  });
});

describe("password reset", () => {
  it("sends a one-time link that changes the password and ends all sessions", async () => {
    const oldSession = await signedInToken();
    await container.auth.requestPasswordReset("owner@coffeepoint.kz", client);
    const token = new URL(lastEmailLink()).searchParams.get("token") ?? "";

    expect(await container.auth.resetPassword(token, "Новый-пароль-2026")).toEqual({ ok: true });
    expect(await container.auth.resetPassword(token, "Ещё-один-пароль-1")).toEqual({ ok: false });
    expect(await container.auth.getSession(oldSession)).toBeNull();
    expect((await signIn("owner@coffeepoint.kz", DEMO_PASSWORD)).ok).toBe(false);
    expect((await signIn("owner@coffeepoint.kz", "Новый-пароль-2026")).ok).toBe(true);
  });

  it("expires links after 30 minutes", async () => {
    await container.auth.requestPasswordReset("owner@coffeepoint.kz", client);
    const token = new URL(lastEmailLink()).searchParams.get("token") ?? "";

    now += 30 * MINUTE + 1;
    expect(await container.auth.resetPassword(token, "Новый-пароль-2026")).toEqual({ ok: false });
  });

  it("sends nothing for unknown emails but still resolves", async () => {
    await expect(container.auth.requestPasswordReset("nobody@example.kz", client)).resolves.toBeUndefined();
    expect(container.outbox?.list()).toEqual([]);
  });

  it("caps reset emails per address", async () => {
    for (let i = 0; i < 5; i++) await container.auth.requestPasswordReset("owner@coffeepoint.kz", client);
    expect(container.outbox?.list()).toHaveLength(3);
  });
});

describe("invitations", () => {
  it("previews and accepts an invitation for a new user", async () => {
    expect(await container.auth.getInvitation(DEMO_INVITATION_TOKEN)).toMatchObject({
      email: "barista@coffeepoint.kz",
      organizationName: "Coffee Point",
      role: "MANAGER",
      status: "PENDING",
      existingUser: false,
    });

    const result = await container.auth.acceptInvitation(
      { token: DEMO_INVITATION_TOKEN, name: "Новый Бариста", password: "Кофе-с-молоком-1" },
      client,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session?.user.email).toBe("barista@coffeepoint.kz");

    const user = await container.repositories.users.findByEmail("barista@coffeepoint.kz");
    const membership = await container.repositories.memberships.find(user?.id ?? "", result.organizationId);
    expect(membership?.role).toBe("MANAGER");
    expect(
      await container.auth.acceptInvitation(
        { token: DEMO_INVITATION_TOKEN, name: "X", password: "y" },
        client,
      ),
    ).toEqual({ ok: false, reason: "ALREADY_ACCEPTED" });
  });

  it("requires a password for new users", async () => {
    expect(await container.auth.acceptInvitation({ token: DEMO_INVITATION_TOKEN }, client)).toEqual({
      ok: false,
      reason: "PASSWORD_REQUIRED",
    });
  });

  it("refuses expired and unknown invitations", async () => {
    now += 6 * 24 * 60 * MINUTE;
    expect(await container.auth.acceptInvitation({ token: DEMO_INVITATION_TOKEN }, client)).toEqual({
      ok: false,
      reason: "EXPIRED",
    });
    expect(await container.auth.acceptInvitation({ token: randomToken() }, client)).toEqual({
      ok: false,
      reason: "INVALID_TOKEN",
    });
  });

  it("adds an existing user to the organization without creating a session", async () => {
    const [beauty] = await container.repositories.organizations.list({ search: "Aru" });
    const token = randomToken();
    await container.repositories.invitations.create({
      email: "manager@coffeepoint.kz",
      organizationId: beauty?.id ?? "",
      role: "MANAGER",
      invitedById: null,
      expiresAt: new Date(START + 60 * MINUTE).toISOString(),
      acceptedAt: null,
      tokenHash: sha256(token),
    });

    const result = await container.auth.acceptInvitation({ token }, client);
    expect(result).toMatchObject({ ok: true, session: null, organizationId: beauty?.id });
    const manager = await container.repositories.users.findByEmail("manager@coffeepoint.kz");
    expect(await container.repositories.memberships.listByUser(manager?.id ?? "")).toHaveLength(2);
  });
});

describe("temporary passwords", () => {
  it("works once to get in, then the person must choose their own password", async () => {
    const memberId = (await container.repositories.users.findByEmail("manager@coffeepoint.kz"))!.id;
    const temporary = await container.auth.issueTemporaryPassword(memberId);
    expect(temporary).toMatch(/^[A-Za-z0-9]{12}$/);

    // The old password stops working at once, and so do sessions already open.
    expect((await signIn("manager@coffeepoint.kz", DEMO_PASSWORD)).ok).toBe(false);
    const signedIn = await signIn("manager@coffeepoint.kz", temporary!);
    expect(signedIn.ok).toBe(true);
    if (!signedIn.ok) return;
    expect((await container.auth.getSession(signedIn.session.token))?.user.mustChangePassword).toBe(true);

    const changed = await container.auth.changePassword({
      userId: memberId,
      currentSessionId: signedIn.session.token.split(".")[0]!,
      currentPassword: temporary!,
      newPassword: "Мой-новый-пароль-2026",
    });
    expect(changed.ok).toBe(true);
    expect((await container.repositories.users.findById(memberId))?.mustChangePassword).toBe(false);
    expect((await signIn("manager@coffeepoint.kz", "Мой-новый-пароль-2026")).ok).toBe(true);
  });

  it("ends every session of the person when a temporary password is issued", async () => {
    const token = await signedInToken("manager@coffeepoint.kz");
    const memberId = (await container.repositories.users.findByEmail("manager@coffeepoint.kz"))!.id;
    await container.auth.issueTemporaryPassword(memberId);
    expect(await container.auth.getSession(token)).toBeNull();
  });

  it("returns nothing for an unknown user", async () => {
    expect(await container.auth.issueTemporaryPassword("00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});
