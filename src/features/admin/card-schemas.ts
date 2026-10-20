import { z } from "zod";

import { MAX_BATCH_QUANTITY } from "@/features/batches/schemas";
import { CARD_CODE_PATTERN } from "@/features/cards/code";
import { cardStatusSchema, cardTypeSchema } from "@/features/cards/schemas";
import { idSchema, textSchema } from "@/lib/schemas";
import { validationMessage } from "@/lib/validation-messages";

const optionalId = z.union([idSchema, z.literal("").transform(() => null), z.null()]);

export const createBatchSchema = z.object({
  name: textSchema(120),
  quantity: z.coerce.number().int().min(1).max(MAX_BATCH_QUANTITY),
  cardType: cardTypeSchema,
  notes: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v === "" ? null : v)),
});
export type CreateBatchInput = z.input<typeof createBatchSchema>;

/** Assign selected cards (ids), a range of a batch, or pasted codes. */
export const assignCardsSchema = z
  .object({
    organizationId: idSchema,
    locationId: optionalId,
    cardIds: z.array(idSchema).max(MAX_BATCH_QUANTITY).optional(),
    codes: z.string().max(20_000).optional(),
    range: z
      .object({ batchId: idSchema, from: z.coerce.number().int().min(1), to: z.coerce.number().int().min(1) })
      .refine((r) => r.from <= r.to, { error: validationMessage("rangeOrder"), path: ["to"] })
      .optional(),
  })
  .refine((v) => Boolean(v.cardIds?.length || v.codes?.trim() || v.range), {
    error: validationMessage("selectCards"),
    path: ["codes"],
  });
export type AssignCardsInput = z.input<typeof assignCardsSchema>;

export const bulkCardStatusSchema = z.object({
  cardIds: z.array(idSchema).min(1).max(MAX_BATCH_QUANTITY),
  status: cardStatusSchema,
});

export const flashCardSchema = z.object({
  cardId: idSchema,
  nfcWritten: z.boolean().optional(),
  nfcLocked: z.boolean().optional(),
});

/** Codes from pasted text: any separators, only valid 8-char codes, de-duplicated. */
export function parseCodes(text: string): string[] {
  const tokens = text.split(/[^A-Za-z0-9]+/).filter((t) => CARD_CODE_PATTERN.test(t));
  return [...new Set(tokens)];
}
