import { z } from "zod";

import {
  emptyToNull,
  idSchema,
  optionalTextSchema,
  phoneInputSchema,
  phoneSchema,
  textSchema,
  timestampSchema,
} from "@/lib/schemas";

export const leadStatuses = ["NEW", "IN_PROGRESS", "CONVERTED", "REJECTED"] as const;
export const leadStatusSchema = z.enum(leadStatuses);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

/** A request submitted through the landing page form. */
export const leadSchema = z.object({
  id: idSchema,
  name: textSchema(120),
  phone: phoneSchema,
  businessName: textSchema(160),
  city: optionalTextSchema(80),
  message: optionalTextSchema(2000),
  status: leadStatusSchema,
  assigneeId: idSchema.nullable(),
  createdAt: timestampSchema,
});
export type Lead = z.infer<typeof leadSchema>;

/** The landing page form. `website` is a honeypot: hidden from people, filled in by naive bots. */
export const submitLeadSchema = z.object({
  name: textSchema(120),
  phone: phoneInputSchema,
  businessName: textSchema(160),
  city: emptyToNull(textSchema(80)),
  message: emptyToNull(textSchema(2000)),
  website: z.string().max(200).optional(),
});
export type SubmitLeadInput = z.input<typeof submitLeadSchema>;
export type SubmitLeadData = Omit<z.output<typeof submitLeadSchema>, "website">;
