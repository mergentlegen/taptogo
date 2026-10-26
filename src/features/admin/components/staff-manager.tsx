"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, LockOpen, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { User } from "@/features/users/schemas";
import { formatDateTime } from "@/lib/format";
import { applyActionError } from "@/lib/forms";

import { createStaffAction, setStaffStatusAction } from "../actions";
import { createStaffSchema } from "../schemas";
import { YesNoBadge } from "./badges";

export function StaffManager({ staff, currentUserId }: { staff: User[]; currentUserId: string }) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: { message: string } }>) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(t("adm.common.saved"));
      else toast.error(result.error?.message);
    });

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <CreateStaffDialog />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("adm.staff.columns.name")}</TableHead>
              <TableHead>{t("adm.staff.columns.status")}</TableHead>
              <TableHead>{t("adm.staff.columns.lastLogin")}</TableHead>
              <TableHead>{t("adm.staff.columns.totp")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("adm.common.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((user) => {
              const self = user.id === currentUserId;
              return (
                <TableRow key={user.id} data-testid="staff-row">
                  <TableCell>
                    <span className="font-medium">{user.name}</span>
                    {self && <span className="text-muted-foreground"> ({t("adm.staff.you")})</span>}
                    <span className="block text-xs text-muted-foreground">{user.email}</span>
                  </TableCell>
                  <TableCell>
                    <YesNoBadge
                      value={user.status === "ACTIVE"}
                      yes={t("adm.userStatuses.ACTIVE")}
                      no={t(`adm.userStatuses.${user.status}`)}
                    />
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : t("adm.staff.never")}
                  </TableCell>
                  <TableCell>{user.totpEnabled ? t("adm.common.yes") : t("adm.common.no")}</TableCell>
                  <TableCell className="text-right">
                    {!self &&
                      (user.status === "BLOCKED" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            run(() => setStaffStatusAction({ userId: user.id, status: "ACTIVE" }))
                          }
                        >
                          <LockOpen data-icon="inline-start" />
                          {t("adm.staff.unblock")}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            run(() => setStaffStatusAction({ userId: user.id, status: "BLOCKED" }))
                          }
                        >
                          <Lock data-icon="inline-start" />
                          {t("adm.staff.block")}
                        </Button>
                      ))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function CreateStaffDialog() {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof createStaffSchema>, unknown, z.output<typeof createStaffSchema>>({
    resolver: zodResolver(createStaffSchema),
    defaultValues: { email: "", name: "" },
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const result = await createStaffAction(form.getValues());
      if (result.ok) {
        toast.success(t("adm.staff.created"));
        form.reset();
        setOpen(false);
      } else setFormError(applyActionError(result.error, form.setError, ["email", "name"]));
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus data-icon="inline-start" />
          {t("adm.staff.new")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adm.staff.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-3">
          {formError && <FormAlert>{formError}</FormAlert>}
          <FormField label={t("adm.staff.name")} error={form.formState.errors.name?.message}>
            <Input {...form.register("name")} />
          </FormField>
          <FormField label={t("adm.staff.email")} error={form.formState.errors.email?.message}>
            <Input type="email" {...form.register("email")} />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {t("adm.common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
