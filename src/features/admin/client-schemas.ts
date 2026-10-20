import { z } from "zod";

import { organizationStatusSchema } from "@/features/organizations/schemas";
import { planSchema } from "@/features/subscriptions/schemas";
import { orgRoleSchema } from "@/features/team/schemas";
import {
  binSchema,
  dateSchema,
  emailSchema,
  emptyToNull,
  httpsUrlSchema,
  idSchema,
  phoneSchema,
  textSchema,
} from "@/lib/schemas";

export const clientOrganizationSchema = z.object({
  name: textSchema(120),
  legalName: emptyToNull(textSchema(200)),
  bin: emptyToNull(binSchema),
  contactName: textSchema(120),
  contactPhone: phoneSchema,
  contactEmail: emailSchema,
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
  owner: z.object({ email: emailSchema }),
  subscription: z.object({
    plan: planSchema,
    paidUntil: dateSchema,
    trial: z.boolean(),
  }),
});
export type CreateClientInput = z.input<typeof createClientSchema>;

export const updateClientSchema = clientOrganizationSchema.extend({ organizationId: idSchema });
export const setClientStatusSchema = z.object({ organizationId: idSchema, status: organizationStatusSchema });
export const addLocationSchema = newLocationSchema.extend({ organizationId: idSchema });
export const inviteToClientSchema = z.object({
  organizationId: idSchema,
  email: emailSchema,
  role: orgRoleSchema,
});
export const resolveTwogisSchema = z.object({ url: httpsUrlSchema });
