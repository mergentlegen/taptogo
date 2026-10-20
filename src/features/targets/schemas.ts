import { z } from "zod";

import { httpsUrlSchema, idSchema, timestampSchema } from "@/lib/schemas";

export const redirectTargetTypes = ["TWOGIS_REVIEW", "TWOGIS_PROFILE", "GOOGLE_MAPS", "CUSTOM"] as const;
export const redirectTargetTypeSchema = z.enum(redirectTargetTypes);
export type RedirectTargetType = z.infer<typeof redirectTargetTypeSchema>;

export const redirectTargetSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  locationId: idSchema.nullable(),
  type: redirectTargetTypeSchema,
  url: httpsUrlSchema,
  isVerified: z.boolean(),
  createdAt: timestampSchema,
});
export type RedirectTarget = z.infer<typeof redirectTargetSchema>;
