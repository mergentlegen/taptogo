"use server";

import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { runAction, type ActionResult } from "@/server/actions";
import { SESSION_COOKIE } from "@/server/auth/cookies";
import {
  clearSessionCookie,
  getClientInfo,
  setActiveOrganizationCookie,
  setSessionCookie,
} from "@/server/auth/session";
import type { SignInFailure } from "@/server/auth/types";
import { getContainer } from "@/server/container";
import { AppError, type ErrorCode } from "@/server/errors";

import { homePathFor, safeNextPath } from "./redirect";
import {
  acceptInvitationExistingSchema,
  acceptInvitationSchema,
  demoSignInSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  signInSchema,
  type AcceptInvitationInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type SignInInput,
} from "./schemas";

const failureCodes: Record<SignInFailure, ErrorCode> = {
  INVALID_CREDENTIALS: "UNAUTHORIZED",
  RATE_LIMITED: "RATE_LIMITED",
  BLOCKED: "FORBIDDEN",
};

async function signInFailure(reason: SignInFailure): Promise<never> {
  const t = await getTranslations("auth.errors");
  throw new AppError(failureCodes[reason], t(reason));
}

export async function signInAction(input: SignInInput): Promise<ActionResult<never>> {
  return runAction(signInSchema, input, async ({ email, password, next }) => {
    const result = await getContainer().auth.signIn({ email, password }, await getClientInfo());
    if (!result.ok) return signInFailure(result.reason);

    await setSessionCookie(result.session);
    redirect(safeNextPath(next) ?? homePathFor(result.session.user));
  });
}

/** Development-only "Sign in as…" — refuses to work in production builds. */
export async function signInAsDemoAction(input: {
  email: string;
  next?: string;
}): Promise<ActionResult<never>> {
  return runAction(demoSignInSchema, input, async ({ email, next }) => {
    const { demo } = getContainer();
    if (process.env.NODE_ENV === "production" || !demo) {
      throw new AppError("FORBIDDEN", (await getTranslations("auth.errors"))("DEMO_DISABLED"));
    }
    const result = await demo.signIn(email, await getClientInfo());
    if (!result.ok) return signInFailure(result.reason);

    await setSessionCookie(result.session);
    redirect(safeNextPath(next) ?? homePathFor(result.session.user));
  });
}

export async function signOutAction(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await getContainer().auth.signOut(token);
  await clearSessionCookie();
  redirect("/login?signedOut=1");
}

export async function requestPasswordResetAction(input: ForgotPasswordInput): Promise<ActionResult> {
  return runAction(forgotPasswordSchema, input, async ({ email }) => {
    // Same answer whether or not the account exists.
    await getContainer().auth.requestPasswordReset(email, await getClientInfo());
    return null;
  });
}

export async function resetPasswordAction(input: ResetPasswordInput): Promise<ActionResult<never>> {
  return runAction(resetPasswordSchema, input, async ({ token, password }) => {
    const { ok } = await getContainer().auth.resetPassword(token, password);
    if (!ok) throw new AppError("VALIDATION", (await getTranslations("auth.errors"))("RESET_INVALID"));
    await clearSessionCookie();
    redirect("/login?reset=1");
  });
}

async function finishInvitation(input: { token: string; name?: string; password?: string }): Promise<never> {
  const result = await getContainer().auth.acceptInvitation(input, await getClientInfo());
  if (!result.ok) throw new AppError("VALIDATION", (await getTranslations("auth.errors"))("INVITE_INVALID"));

  if (!result.session) redirect("/login?invited=1");
  await setSessionCookie(result.session);
  await setActiveOrganizationCookie(result.organizationId);
  redirect("/app");
}

export async function acceptInvitationAction(input: AcceptInvitationInput): Promise<ActionResult<never>> {
  return runAction(acceptInvitationSchema, input, ({ token, name, password }) =>
    finishInvitation({ token, name, password }),
  );
}

export async function acceptInvitationExistingAction(input: { token: string }): Promise<ActionResult<never>> {
  return runAction(acceptInvitationExistingSchema, input, ({ token }) => finishInvitation({ token }));
}
