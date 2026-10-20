import { z } from "zod";

import { idSchema, textSchema } from "@/lib/schemas";

/** "" from a <select> means "not set". */
const optionalId = z.union([idSchema, z.literal("").transform(() => null), z.null()]);

export const updateCardSchema = z.object({
  cardId: idSchema,
  label: textSchema(80),
  locationId: optionalId,
  employeeId: optionalId,
  targetId: optionalId,
});
export type UpdateCardInput = z.input<typeof updateCardSchema>;

export const cardIdSchema = z.object({ cardId: idSchema });
export const setCardPausedSchema = z.object({ cardId: idSchema, paused: z.boolean() });
