"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { platformSettingsSchema } from "@/features/platform/schemas";
import type { TargetUrlCheck } from "@/features/targets/url-policy";
import type { ActionResult } from "@/server/actions";
import { runAdminAction } from "@/server/admin-action";
import { authorizePlatformAction } from "@/server/auth/session";
import type { FirmPreview } from "@/server/providers/reviews/types";
import { getServices } from "@/server/services";

import {
  assignCardsSchema,
  bulkCardStatusSchema,
  createBatchSchema,
  flashCardSchema,
  parseCodes,
  type AssignCardsInput,
  type CreateBatchInput,
} from "./card-schemas";
import {
  addLocationSchema,
  createClientSchema,
  inviteToClientSchema,
  markSentSchema,
  resolveTwogisSchema,
  setClientStatusSchema,
  temporaryPasswordSchema,
  updateClientSchema,
  type CreateClientInput,
} from "./client-schemas";
import {
  addCommentSchema,
  checkUrlSchema,
  createStaffSchema,
  createTargetSchema,
  impersonateSchema,
  platformSettingsFormSchema,
  recordPaymentSchema,
  setStaffStatusSchema,
  setTargetVerifiedSchema,
  syncLocationSchema,
  updateLeadSchema,
  updateSubscriptionSchema,
  updateTicketSchema,
  type CreateStaffInput,
  type CreateTargetInput,
  type PlatformSettingsFormInput,
  type RecordPaymentInput,
  type UpdateSubscriptionInput,
} from "./schemas";

const admin = () => getServices().admin;

// ── Clients ────────────────────────────────────────────────────────────────

export async function createClientAction(input: CreateClientInput): Promise<ActionResult<{ id: string }>> {
  return runAdminAction("admin.manage", createClientSchema, input, async (ctx, data) => {
    const organization = await admin().clients.create(ctx, data);
    return { id: organization.id };
  });
}

export async function updateClientAction(input: z.input<typeof updateClientSchema>): Promise<ActionResult> {
  return runAdminAction(
    "admin.manage",
    updateClientSchema,
    input,
    async (ctx, { organizationId, ...data }) => {
      await admin().clients.update(ctx, organizationId, data);
      return null;
    },
  );
}

export async function setClientStatusAction(
  input: z.input<typeof setClientStatusSchema>,
): Promise<ActionResult> {
  return runAdminAction(
    "admin.manage",
    setClientStatusSchema,
    input,
    async (ctx, { organizationId, status }) => {
      await admin().clients.setStatus(ctx, organizationId, status);
      return null;
    },
  );
}

/** Invite (or re-invite) someone into a client's cabinet, e.g. when the wizard's email bounced. */
export async function inviteToClientAction(
  input: z.input<typeof inviteToClientSchema>,
): Promise<ActionResult> {
  return runAdminAction(
    "admin.manage",
    inviteToClientSchema,
    input,
    async (ctx, { organizationId, ...invite }) => {
      await admin().clients.invite(ctx, organizationId, invite);
      return null;
    },
  );
}

/** Shown once on the admin's screen; the server keeps only the hash. */
export async function issueTemporaryPasswordAction(
  input: z.input<typeof temporaryPasswordSchema>,
): Promise<ActionResult<{ password: string }>> {
  return runAdminAction(
    "admin.manage",
    temporaryPasswordSchema,
    input,
    async (ctx, { organizationId, userId }) => {
      const password = await admin().clients.issueTemporaryPassword(ctx, organizationId, userId);
      return { password };
    },
  );
}

/** The admin sends the queued message by hand, then confirms it here. */
export async function markOutboxSentAction(input: { id: string }): Promise<ActionResult> {
  return runAdminAction("admin.manage", markSentSchema, input, async (ctx, { id }) => {
    await admin().outbox.markSent(ctx, id);
    return null;
  });
}

export async function addLocationAction(input: z.input<typeof addLocationSchema>): Promise<ActionResult> {
  return runAdminAction(
    "admin.manage",
    addLocationSchema,
    input,
    async (ctx, { organizationId, ...location }) => {
      await admin().clients.addLocation(ctx, organizationId, location);
      return null;
    },
  );
}

/** Read-only preview for the 2GIS link field. */
export async function resolveTwogisAction(input: { url: string }): Promise<ActionResult<FirmPreview | null>> {
  return runAdminAction("admin.manage", resolveTwogisSchema, input, (_ctx, { url }) =>
    admin().clients.resolveTwogis(url),
  );
}

export async function startImpersonationAction(input: {
  organizationId: string;
}): Promise<ActionResult<never>> {
  const result = await runAdminAction(
    "admin.impersonate",
    impersonateSchema,
    input,
    async (ctx, { organizationId }) => {
      await admin().clients.startImpersonation(ctx, organizationId);
      return null;
    },
  );
  if (result.ok) redirect("/app");
  return result;
}

/** Called from the yellow banner inside the client cabinet. */
export async function stopImpersonationAction(): Promise<void> {
  const { session } = await authorizePlatformAction("admin.access");
  const role = session.user.platformRole;
  const previous = role
    ? await admin().clients.stopImpersonation({ userId: session.user.id, role, sessionId: session.id })
    : null;
  redirect(previous ? `/admin/organizations/${previous.organizationId}` : "/admin");
}

// ── Cards and batches ───────────────────────────────────────────────────────

export async function createBatchAction(input: CreateBatchInput): Promise<ActionResult<{ id: string }>> {
  return runAdminAction("admin.manage", createBatchSchema, input, async (ctx, data) => {
    const batch = await admin().cards.createBatch(ctx, data);
    return { id: batch.id };
  });
}

export async function assignCardsAction(input: AssignCardsInput): Promise<ActionResult<{ count: number }>> {
  return runAdminAction("admin.manage", assignCardsSchema, input, async (ctx, data) => {
    const service = admin().cards;
    const cards = await service.resolveSelection({
      cardIds: data.cardIds,
      codes: data.codes ? parseCodes(data.codes) : undefined,
      range: data.range,
    });
    const assigned = await service.assign(ctx, cards, data.organizationId, data.locationId);
    return { count: assigned.length };
  });
}

export async function bulkCardStatusAction(
  input: z.input<typeof bulkCardStatusSchema>,
): Promise<ActionResult> {
  return runAdminAction(
    "admin.cards.status",
    bulkCardStatusSchema,
    input,
    async (ctx, { cardIds, status }) => {
      await admin().cards.setStatus(ctx, cardIds, status);
      return null;
    },
  );
}

export async function flashCardAction(input: z.input<typeof flashCardSchema>): Promise<ActionResult> {
  return runAdminAction("admin.manage", flashCardSchema, input, async (ctx, { cardId, ...state }) => {
    await admin().cards.setFlashState(ctx, cardId, state);
    return null;
  });
}

// ── Targets ────────────────────────────────────────────────────────────────

export async function createTargetAction(input: CreateTargetInput): Promise<ActionResult> {
  return runAdminAction("admin.manage", createTargetSchema, input, async (ctx, data) => {
    await admin().targets.create(ctx, data);
    return null;
  });
}

export async function setTargetVerifiedAction(
  input: z.input<typeof setTargetVerifiedSchema>,
): Promise<ActionResult> {
  return runAdminAction(
    "admin.manage",
    setTargetVerifiedSchema,
    input,
    async (ctx, { targetId, isVerified }) => {
      await admin().targets.setVerified(ctx, targetId, isVerified);
      return null;
    },
  );
}

export async function checkTargetUrlAction(input: { url: string }): Promise<ActionResult<TargetUrlCheck>> {
  return runAdminAction("admin.access", checkUrlSchema, input, (_ctx, { url }) => admin().targets.check(url));
}

// ── Billing ────────────────────────────────────────────────────────────────

export async function recordPaymentAction(
  input: RecordPaymentInput,
): Promise<ActionResult<{ paidUntil: string }>> {
  return runAdminAction("admin.manage", recordPaymentSchema, input, async (ctx, data) => {
    const { paidUntil } = await admin().billing.recordPayment(ctx, data);
    return { paidUntil };
  });
}

export async function updateSubscriptionAction(input: UpdateSubscriptionInput): Promise<ActionResult> {
  return runAdminAction("admin.manage", updateSubscriptionSchema, input, async (ctx, data) => {
    await admin().billing.updateSubscription(ctx, data);
    return null;
  });
}

// ── Integrations ───────────────────────────────────────────────────────────

export async function syncLocationAction(input: { locationId: string }): Promise<ActionResult> {
  return runAdminAction("admin.manage", syncLocationSchema, input, async (ctx, { locationId }) => {
    await admin().integrations.sync(ctx, locationId);
    return null;
  });
}

export async function syncAllAction(): Promise<ActionResult<{ synced: number; skipped: number }>> {
  return runAdminAction("admin.manage", z.undefined(), undefined, (ctx) => admin().integrations.syncAll(ctx));
}

// ── Inbox ──────────────────────────────────────────────────────────────────

export async function updateTicketAction(input: z.input<typeof updateTicketSchema>): Promise<ActionResult> {
  return runAdminAction("admin.inbox", updateTicketSchema, input, async (ctx, { ticketId, ...patch }) => {
    await admin().inbox.updateTicket(ctx, ticketId, patch);
    return null;
  });
}

export async function updateLeadAction(input: z.input<typeof updateLeadSchema>): Promise<ActionResult> {
  return runAdminAction("admin.inbox", updateLeadSchema, input, async (ctx, { leadId, ...patch }) => {
    await admin().inbox.updateLead(ctx, leadId, patch);
    return null;
  });
}

export async function addCommentAction(input: z.input<typeof addCommentSchema>): Promise<ActionResult> {
  return runAdminAction(
    "admin.inbox",
    addCommentSchema,
    input,
    async (ctx, { subjectType, subjectId, body }) => {
      await admin().inbox.addComment(ctx, subjectType, subjectId, body);
      return null;
    },
  );
}

// ── Staff and settings ─────────────────────────────────────────────────────

export async function createStaffAction(input: CreateStaffInput): Promise<ActionResult> {
  return runAdminAction("admin.staff.manage", createStaffSchema, input, async (ctx, data) => {
    await admin().staff.create(ctx, data);
    return null;
  });
}

export async function setStaffStatusAction(
  input: z.input<typeof setStaffStatusSchema>,
): Promise<ActionResult> {
  return runAdminAction(
    "admin.staff.manage",
    setStaffStatusSchema,
    input,
    async (ctx, { userId, status }) => {
      await admin().staff.setStatus(ctx, userId, status);
      return null;
    },
  );
}

export async function updateSettingsAction(input: PlatformSettingsFormInput): Promise<ActionResult> {
  return runAdminAction("admin.settings.manage", platformSettingsFormSchema, input, async (ctx, form) => {
    // Re-validate the assembled settings with the canonical schema (domain format, 3 plans).
    const settings = platformSettingsSchema.parse({
      allowedRedirectDomains: form.domains
        .split(/\s+/)
        .map((d) => d.trim())
        .filter(Boolean),
      graceDays: form.graceDays,
      plans: form.plans,
    });
    await admin().settings.update(ctx, settings);
    return null;
  });
}
