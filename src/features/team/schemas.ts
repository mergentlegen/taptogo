import { z } from "zod";

import { emailSchema, idSchema, timestampSchema } from "@/lib/schemas";

export const orgRoles = ["OWNER", "MANAGER"] as const;
export const orgRoleSchema = z.enum(orgRoles);
export type OrgRole = z.infer<typeof orgRoleSchema>;

export const membershipSchema = z.object({
  userId: idSchema,
  organizationId: idSchema,
  role: orgRoleSchema,
  createdAt: timestampSchema,
});
export type Membership = z.infer<typeof membershipSchema>;

/** The token itself is never stored; repositories keep only its hash. */
export const invitationSchema = z.object({
  id: idSchema,
  email: emailSchema,
  organizationId: idSchema,
  role: orgRoleSchema,
  invitedById: idSchema.nullable(),
  expiresAt: timestampSchema,
  acceptedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type Invitation = z.infer<typeof invitationSchema>;
