"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, UserMinus, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { CopyField } from "@/components/forms/copy-field";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatDateTime } from "@/lib/format";
import { applyActionError } from "@/lib/forms";
import type { PendingInvitation, TeamMember } from "@/server/services/team-service";

import {
  changeMemberRoleAction,
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
} from "../actions";
import { inviteSchema } from "../form-schemas";
import { orgRoles, type OrgRole } from "../schemas";

type ActionLike = () => Promise<{ ok: boolean; error?: { message: string } }>;

export function TeamManager({
  members,
  invitations,
  timeZone,
}: {
  members: TeamMember[];
  invitations: PendingInvitation[];
  timeZone: string;
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const run = (action: ActionLike, success: string) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error?.message);
    });

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <InviteDialog />
      </div>

      <Card>
        <CardContent className="divide-y p-0">
          {members.map((member) => (
            <div
              key={member.userId}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
              data-testid="team-member"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {member.name}{" "}
                  {member.isCurrentUser && (
                    <span className="text-sm text-muted-foreground">({t("team.you")})</span>
                  )}
                </p>
                <p className="truncate text-sm text-muted-foreground">{member.email}</p>
                <p className="text-xs text-muted-foreground">
                  {t("team.columns.lastLogin")}:{" "}
                  {member.lastLoginAt ? formatDateTime(member.lastLoginAt, timeZone) : t("team.never")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={member.role}
                  disabled={pending}
                  onValueChange={(role) =>
                    run(
                      () => changeMemberRoleAction({ userId: member.userId, role: role as OrgRole }),
                      t("team.roleChanged"),
                    )
                  }
                >
                  <SelectTrigger className="w-40" aria-label={`${t("team.changeRole")}: ${member.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {orgRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {t(`roles.${role}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ConfirmDialog
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={pending}
                      aria-label={`${t("team.remove")}: ${member.name}`}
                    >
                      <UserMinus />
                    </Button>
                  }
                  title={t("team.removeTitle")}
                  description={t("team.removeText", { name: member.name })}
                  confirmLabel={t("team.removeConfirm")}
                  cancelLabel={t("team.cancel")}
                  onConfirm={() =>
                    run(() => removeMemberAction({ userId: member.userId }), t("team.removed"))
                  }
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("team.invitations")}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center gap-3 p-4" data-testid="team-invitation">
                <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`roles.${invitation.role}`)} ·{" "}
                    {t("team.expires", { date: formatDate(invitation.expiresAt, timeZone) })}
                  </p>
                </div>
                <Badge variant={invitation.status === "PENDING" ? "secondary" : "outline"}>
                  {invitation.status === "PENDING" ? t("team.pending") : t("team.expired")}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(() => revokeInvitationAction({ invitationId: invitation.id }), t("team.revoked"))
                  }
                >
                  <X data-icon="inline-start" />
                  {t("team.revoke")}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InviteDialog() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const form = useForm<z.input<typeof inviteSchema>, unknown, z.output<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", role: "MANAGER" },
  });
  const role = useWatch({ control: form.control, name: "role" });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const result = await inviteMemberAction(form.getValues());
      if (result.ok) {
        setLink(result.data.link);
        form.reset();
      } else {
        setFormError(applyActionError(result.error, form.setError, ["email"]));
      }
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setLink(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus data-icon="inline-start" />
          {t("team.invite")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("team.inviteTitle")}</DialogTitle>
          <DialogDescription>{link ? t("team.linkHint") : t("team.inviteText")}</DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="grid gap-4">
            <CopyField label={t("team.linkLabel")} value={link} testId="invitation-link" />
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>{t("team.done")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            {formError && <FormAlert>{formError}</FormAlert>}
            <FormField label={t("team.email")} error={form.formState.errors.email?.message}>
              <Input type="email" autoComplete="off" {...form.register("email")} />
            </FormField>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormField label={t("team.role")} hint={t(`team.roleHints.${role}`)}>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {orgRoles.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`roles.${r}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t("team.cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {t("team.createLink")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
