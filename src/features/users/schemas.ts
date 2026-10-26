import { z } from "zod";

import { emailSchema, idSchema, phoneSchema, textSchema, timestampSchema } from "@/lib/schemas";

/** One platform role: the team is small, every staff member can do everything. */
export const platformRoles = ["ADMIN"] as const;
export const platformRoleSchema = z.enum(platformRoles);
export type PlatformRole = z.infer<typeof platformRoleSchema>;

export const userStatuses = ["ACTIVE", "BLOCKED", "PENDING"] as const;
export const userStatusSchema = z.enum(userStatuses);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const userSchema = z.object({
  id: idSchema,
  email: emailSchema,
  name: textSchema(120),
  phone: phoneSchema.nullable(),
  /** null for client users; set only for TapToGo staff. */
  platformRole: platformRoleSchema.nullable(),
  status: userStatusSchema,
  totpEnabled: z.boolean(),
  /** Set when an administrator issued a temporary password: the account works only after a change. */
  mustChangePassword: z.boolean(),
  lastLoginAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type User = z.infer<typeof userSchema>;
