import { z } from "zod";

import { textSchema } from "@/lib/schemas";

export const ticketSchema = z.object({ subject: textSchema(200), body: textSchema(5000) });
export type TicketInput = z.input<typeof ticketSchema>;
