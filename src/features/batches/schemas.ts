import { z } from "zod";

import { cardTypeSchema, MAX_BATCH_QUANTITY } from "@/features/cards/schemas";
import { idSchema, optionalTextSchema, textSchema, timestampSchema } from "@/lib/schemas";

export { MAX_BATCH_QUANTITY };

export const cardBatchSchema = z.object({
  id: idSchema,
  name: textSchema(120),
  quantity: z.int().min(1).max(MAX_BATCH_QUANTITY),
  cardType: cardTypeSchema,
  notes: optionalTextSchema(1000),
  createdAt: timestampSchema,
});
export type CardBatch = z.infer<typeof cardBatchSchema>;
