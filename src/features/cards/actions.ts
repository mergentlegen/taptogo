"use server";

import type { ActionResult } from "@/server/actions";
import { runOrgAction } from "@/server/org-action";
import { getServices } from "@/server/services";

import { cardIdSchema, setCardPausedSchema, updateCardSchema, type UpdateCardInput } from "./form-schemas";

export async function updateCardAction(input: UpdateCardInput): Promise<ActionResult> {
  return runOrgAction("org.cards.manage", updateCardSchema, input, async (ctx, data) => {
    await getServices().cards.update(ctx, data);
    return null;
  });
}

export async function setCardPausedAction(input: { cardId: string; paused: boolean }): Promise<ActionResult> {
  return runOrgAction("org.cards.manage", setCardPausedSchema, input, async (ctx, { cardId, paused }) => {
    await getServices().cards.setPaused(ctx, cardId, paused);
    return null;
  });
}

export async function reportCardLostAction(input: { cardId: string }): Promise<ActionResult> {
  return runOrgAction("org.cards.manage", cardIdSchema, input, async (ctx, { cardId }) => {
    await getServices().cards.reportLost(ctx, cardId);
    return null;
  });
}
