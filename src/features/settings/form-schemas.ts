import { z } from "zod";

import { newPasswordSchema, PASSWORD_MAX_LENGTH } from "@/features/auth/schemas";
import { emailSchema, emptyToNull, phoneSchema, textSchema } from "@/lib/schemas";
import { validationMessage } from "@/lib/validation-messages";

export const profileSchema = z.object({
  name: textSchema(120),
  phone: emptyToNull(phoneSchema),
});
export type ProfileInput = z.input<typeof profileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    password: newPasswordSchema,
    confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: validationMessage("passwordsMismatch"),
    path: ["confirmPassword"],
  });
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

export const organizationSchema = z.object({
  name: textSchema(120),
  contactName: emptyToNull(textSchema(120)),
  contactPhone: emptyToNull(phoneSchema),
  contactEmail: emptyToNull(emailSchema),
});
export type OrganizationInput = z.input<typeof organizationSchema>;
