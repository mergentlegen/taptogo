import { z } from "zod";

import { emailSchema, textSchema } from "@/lib/schemas";
import { validationMessage } from "@/lib/validation-messages";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Frequent passwords that satisfy the length rule; rejected outright. */
const COMMON_PASSWORDS = new Set([
  "1234567890",
  "12345678910",
  "123456789a",
  "1q2w3e4r5t",
  "1qaz2wsx3edc",
  "password12",
  "password123",
  "password1234",
  "qwerty1234",
  "qwerty12345",
  "qwerty123456",
  "qwertyuiop",
  "asdfghjkl1",
  "iloveyou12",
  "1111111111",
  "0987654321",
  "abcdefghij",
  "abc1234567",
  "admin12345",
  "welcome123",
  "kazakhstan",
  "almaty2024",
  "almaty2025",
  "almaty2026",
  "astana2025",
  "parol12345",
  "йцукенгшщз",
]);

export function isCommonPassword(password: string): boolean {
  const normalized = password.toLowerCase();
  return COMMON_PASSWORDS.has(normalized) || /^(.)\1+$/.test(normalized);
}

/** Policy for new passwords (reset, invitation, change). Not applied at sign-in. */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH)
  .refine((value) => !isCommonPassword(value), { error: validationMessage("commonPassword") });

export const signInSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, { error: validationMessage("passwordRequired") })
    .max(PASSWORD_MAX_LENGTH),
  next: z.string().max(512).optional(),
});
export type SignInInput = z.input<typeof signInSchema>;

export const demoSignInSchema = z.object({
  email: emailSchema,
  next: z.string().max(512).optional(),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, { error: validationMessage("brokenLink") });

const passwordPair = {
  password: newPasswordSchema,
  confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
};
const passwordsMatch = (v: { password: string; confirmPassword: string }) => v.password === v.confirmPassword;
const mismatch = { error: validationMessage("passwordsMismatch"), path: ["confirmPassword"] };

export const resetPasswordSchema = z
  .object({ token: tokenSchema, ...passwordPair })
  .refine(passwordsMatch, mismatch);
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const acceptInvitationSchema = z
  .object({ token: tokenSchema, name: textSchema(120), ...passwordPair })
  .refine(passwordsMatch, mismatch);
export type AcceptInvitationInput = z.input<typeof acceptInvitationSchema>;

/** Existing users accept with a click; they already have a password. */
export const acceptInvitationExistingSchema = z.object({ token: tokenSchema });
