import { z } from "zod";

import {
  emailSchema,
  idSchema,
  phoneSchema,
  textSchema,
  timestampSchema,
  timeZoneSchema,
} from "@/lib/schemas";

export const organizationStatuses = ["ACTIVE", "SUSPENDED", "ARCHIVED"] as const;
export const organizationStatusSchema = z.enum(organizationStatuses);
export type OrganizationStatus = z.infer<typeof organizationStatusSchema>;

export const organizationSchema = z.object({
  id: idSchema,
  name: textSchema(120),
  /** The contact person is optional: the title (and the address of a location) is all that is needed. */
  contactName: textSchema(120).nullable(),
  contactPhone: phoneSchema.nullable(),
  contactEmail: emailSchema.nullable(),
  timezone: timeZoneSchema,
  status: organizationStatusSchema,
  createdAt: timestampSchema,
});
export type Organization = z.infer<typeof organizationSchema>;
