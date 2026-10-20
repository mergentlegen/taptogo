import { z } from "zod";

import { httpsUrlSchema, idSchema, textSchema, timestampSchema } from "@/lib/schemas";

export const locationSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  name: textSchema(120),
  address: textSchema(300),
  twogisFirmId: z
    .string()
    .regex(/^\d{5,20}$/)
    .nullable(),
  twogisProfileUrl: httpsUrlSchema.nullable(),
  isActive: z.boolean(),
  createdAt: timestampSchema,
});
export type Location = z.infer<typeof locationSchema>;

/** Daily capture of a location's public 2GIS figures. Review texts are never stored. */
export const ratingSnapshotSchema = z.object({
  id: idSchema,
  locationId: idSchema,
  capturedAt: timestampSchema,
  rating: z.number().min(0).max(5).nullable(),
  reviewCount: z.int().min(0).nullable(),
});
export type RatingSnapshot = z.infer<typeof ratingSnapshotSchema>;
