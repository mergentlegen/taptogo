import { z } from "zod";

import { organizationStatusSchema } from "@/features/organizations/schemas";
import { orgRoleSchema } from "@/features/team/schemas";
import { emailSchema, emptyToNull, httpsUrlSchema, idSchema, phoneSchema, textSchema } from "@/lib/schemas";

export const clientOrganizationSchema = z.object({
  name: textSchema(120),
  /** The contact person is optional: the title and the address of a location are enough. */
  contactName: emptyToNull(textSchema(120)),
  contactPhone: emptyToNull(phoneSchema),
  contactEmail: emptyToNull(emailSchema),
});

export const newLocationSchema = z.object({
  name: textSchema(120),
  address: textSchema(300),
  /** Link to the organization in 2GIS; optional — a location can be linked later. */
  twogisUrl: emptyToNull(httpsUrlSchema),
});

/** The 4-step "new client" wizard, submitted at once at the end. */
export const createClientSchema = z.object({
  organization: clientOrganizationSchema,
  locations: z.array(newLocationSchema).min(1).max(20),
  owner: z.object({ email: emailSchema, name: textSchema(120) }),
});
export type CreateClientInput = z.input<typeof createClientSchema>;

export const updateClientSchema = clientOrganizationSchema.extend({ organizationId: idSchema });
export const setClientStatusSchema = z.object({ organizationId: idSchema, status: organizationStatusSchema });
export const addLocationSchema = newLocationSchema.extend({ organizationId: idSchema });
export const markSentSchema = z.object({ id: idSchema });
export const temporaryPasswordSchema = z.object({ organizationId: idSchema, userId: idSchema });
export const inviteToClientSchema = z.object({
  organizationId: idSchema,
  email: emailSchema,
  role: orgRoleSchema,
});
export const createAccountSchema = z.object({
  organizationId: idSchema,
  email: emailSchema,
  name: textSchema(120),
  role: orgRoleSchema,
});
export const resolveTwogisSchema = z.object({ url: httpsUrlSchema });
