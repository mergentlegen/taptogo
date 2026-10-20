"use server";

import type { ActionResult } from "@/server/actions";
import { runOrgAction } from "@/server/org-action";
import { getServices } from "@/server/services";

import { ticketSchema, type TicketInput } from "./form-schemas";

export async function createTicketAction(input: TicketInput): Promise<ActionResult> {
  return runOrgAction("org.support", ticketSchema, input, async (ctx, data) => {
    await getServices().support.create(ctx, data);
    return null;
  });
}
