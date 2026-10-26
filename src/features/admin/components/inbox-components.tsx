"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ticketStatuses, type CommentSubject, type TicketStatus } from "@/features/support/schemas";
import { formatDateTime } from "@/lib/format";
import type { CommentView } from "@/server/services/admin/inbox-service";

import { addCommentAction, updateTicketAction } from "../actions";

const NONE = "none";

/** Status + assignee controls for a ticket. */
export function InboxControls({
  id,
  status,
  assigneeId,
  staff,
  disabled,
}: {
  id: string;
  status: TicketStatus;
  assigneeId: string | null;
  staff: { id: string; name: string }[];
  disabled: boolean;
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();

  const update = (patch: { status?: string; assigneeId?: string }) =>
    startTransition(async () => {
      const result = await updateTicketAction({
        ticketId: id,
        ...(patch as { status?: TicketStatus; assigneeId?: string }),
      });
      if (result.ok) toast.success(t("adm.inbox.updated"));
      else toast.error(result.error.message);
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={status} disabled={disabled || pending} onValueChange={(v) => update({ status: v })}>
        <SelectTrigger className="min-w-36" aria-label={t("adm.inbox.status")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ticketStatuses.map((s) => (
            <SelectItem key={s} value={s}>
              {t(`support.statuses.${s}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={assigneeId ?? NONE}
        disabled={disabled || pending}
        onValueChange={(v) => update({ assigneeId: v === NONE ? "" : v })}
      >
        <SelectTrigger className="min-w-44" aria-label={t("adm.inbox.assignee")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t("adm.inbox.unassigned")}</SelectItem>
          {staff.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Staff-only notes; rendered as plain text. */
export function CommentThread({
  subjectType,
  subjectId,
  comments,
  canComment,
}: {
  subjectType: CommentSubject;
  subjectId: string;
  comments: CommentView[];
  canComment: boolean;
}) {
  const t = useTranslations("adm.inbox");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-3">
      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noComments")}</p>
      ) : (
        <ul className="grid gap-3" data-testid="comments">
          {comments.map((c) => (
            <li key={c.id} className="rounded-lg bg-muted p-3 text-sm">
              <p className="mb-1 text-xs text-muted-foreground">
                {c.author} · {formatDateTime(c.createdAt)}
              </p>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canComment && (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await addCommentAction({ subjectType, subjectId, body });
              if (result.ok) setBody("");
              else toast.error(result.error.message);
            });
          }}
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("commentPlaceholder")}
            aria-label={t("addComment")}
            maxLength={2000}
            rows={3}
          />
          <Button type="submit" size="sm" className="justify-self-start" disabled={pending || !body.trim()}>
            {t("addComment")}
          </Button>
        </form>
      )}
    </div>
  );
}
