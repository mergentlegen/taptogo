"use server";

import { runAction, type ActionResult } from "@/server/actions";
import { getClientInfo } from "@/server/auth/session";
import { getServices } from "@/server/services";

import { submitLeadSchema, type SubmitLeadInput } from "./schemas";

/**
 * Public "leave a request" form: Zod validation → no session needed, the
 * service rate-limits by IP and phone instead → lead is stored.
 */
export async function submitLeadAction(input: SubmitLeadInput): Promise<ActionResult> {
  return runAction(submitLeadSchema, input, async ({ website, ...lead }) => {
    // Honeypot filled in: answer like a success so the bot learns nothing, store nothing.
    if (website) return null;
    await getServices().leads.submit(lead, await getClientInfo());
    return null;
  });
}
