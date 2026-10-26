import { z } from "zod";

import {
  binSchema,
  emailSchema,
  idSchema,
  optionalTextSchema,
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
  legalName: optionalTextSchema(200),
  bin: binSchema.nullable(),
  contactName: textSchema(120),
  contactPhone: phoneSchema,
  contactEmail: emailSchema,
  timezone: timeZoneSchema,
  status: organizationStatusSchema,
  createdAt: timestampSchema,
});
export type Organization = z.infer<typeof organizationSchema>;
