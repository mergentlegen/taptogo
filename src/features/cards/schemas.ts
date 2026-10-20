import { z } from "zod";

import { idSchema, textSchema, timestampSchema } from "@/lib/schemas";

import { CARD_CODE_PATTERN } from "./code";

/** Upper bound for one production batch; keeps code generation and exports bounded. */
export const MAX_BATCH_QUANTITY = 2000;

export const cardTypes = ["NFC_CARD", "STICKER", "STAND", "QR_ONLY"] as const;
export const cardTypeSchema = z.enum(cardTypes);
export type CardType = z.infer<typeof cardTypeSchema>;

export const cardStatuses = ["UNASSIGNED", "ACTIVE", "PAUSED", "LOST", "REVOKED"] as const;
export const cardStatusSchema = z.enum(cardStatuses);
export type CardStatus = z.infer<typeof cardStatusSchema>;

export const cardCodeSchema = z.string().regex(CARD_CODE_PATTERN);

export const cardSchema = z.object({
  id: idSchema,
  code: cardCodeSchema,
  batchId: idSchema,
  /** Position within the batch (1…quantity), printed next to the code and used for ranges. */
  number: z.int().min(1).max(MAX_BATCH_QUANTITY),
  organizationId: idSchema.nullable(),
  locationId: idSchema.nullable(),
  employeeId: idSchema.nullable(),
  targetId: idSchema.nullable(),
  /** Human label such as «Касса», «Стол 3», «Мастер Айгерим». */
  label: textSchema(80),
  type: cardTypeSchema,
  status: cardStatusSchema,
  nfcWritten: z.boolean(),
  nfcLocked: z.boolean(),
  activatedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type Card = z.infer<typeof cardSchema>;
