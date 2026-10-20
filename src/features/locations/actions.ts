"use server";

import { z } from "zod";

import { idSchema, textSchema } from "@/lib/schemas";
import type { ActionResult } from "@/server/actions";
import { runOrgAction } from "@/server/org-action";
import { getServices } from "@/server/services";

const twogisChangeSchema = z.object({ locationId: idSchema, message: textSchema(2000) });

/** Files a support ticket; any member who can see the location may ask. */
export async function requestTwogisChangeAction(input: {
  locationId: string;
  message: string;
}): Promise<ActionResult> {
  return runOrgAction("org.support", twogisChangeSchema, input, async (ctx, { locationId, message }) => {
    await getServices().locations.requestTwogisChange(ctx, locationId, message);
    return null;
  });
}
