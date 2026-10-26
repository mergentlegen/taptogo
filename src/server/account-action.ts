import "server-only";

import type { z } from "zod";

import { runAction, type ActionResult } from "@/server/actions";
import { authorizeSession } from "@/server/auth/session";

/**
 * Actions about the signed-in person themselves (their password), which must
 * work before the organization or staff checks: a user with a temporary
 * password is allowed to change it and nothing else.
 */
export function runAccountAction<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  handler: (ctx: { userId: string; sessionId: string }, data: z.output<S>) => Promise<T>,
): Promise<ActionResult<T>> {
  return runAction(schema, input, async (data) => {
    const session = await authorizeSession();
    return handler({ userId: session.user.id, sessionId: session.id }, data);
  });
}
