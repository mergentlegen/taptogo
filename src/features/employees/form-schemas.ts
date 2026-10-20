import { z } from "zod";

import { idSchema, textSchema } from "@/lib/schemas";

const optionalId = z.union([idSchema, z.literal("").transform(() => null), z.null()]);
const optionalText = z
  .string()
  .trim()
  .max(120)
  .transform((v) => (v === "" ? null : v));

export const employeeFormSchema = z.object({
  name: textSchema(120),
  position: optionalText,
  locationId: optionalId,
  isActive: z.boolean(),
});
export type EmployeeFormInput = z.input<typeof employeeFormSchema>;

export const createEmployeeSchema = employeeFormSchema;
export const updateEmployeeSchema = employeeFormSchema.extend({ employeeId: idSchema });
export const deleteEmployeeSchema = z.object({ employeeId: idSchema });
