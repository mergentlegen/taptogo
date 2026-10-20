import { z } from "zod";

import { emailSchema, idSchema } from "@/lib/schemas";

import { orgRoleSchema } from "./schemas";

export const inviteSchema = z.object({ email: emailSchema, role: orgRoleSchema });
export type InviteInput = z.input<typeof inviteSchema>;

export const changeRoleSchema = z.object({ userId: idSchema, role: orgRoleSchema });
export const memberSchema = z.object({ userId: idSchema });
export const invitationIdSchema = z.object({ invitationId: idSchema });
