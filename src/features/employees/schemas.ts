import { z } from "zod";

import { idSchema, optionalTextSchema, textSchema, timestampSchema } from "@/lib/schemas";

export const employeeSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  locationId: idSchema.nullable(),
  name: textSchema(120),
  position: optionalTextSchema(120),
  isActive: z.boolean(),
  createdAt: timestampSchema,
});
export type Employee = z.infer<typeof employeeSchema>;
