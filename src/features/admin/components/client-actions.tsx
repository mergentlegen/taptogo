"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, Eye, Link2, Pause, Pencil, Play, Plus, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { CopyField } from "@/components/forms/copy-field";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Organization, OrganizationStatus } from "@/features/organizations/schemas";
import { orgRoles } from "@/features/team/schemas";
import { applyActionError } from "@/lib/forms";
import type { CreatedAccount } from "@/server/services/admin/client-service";

import {
  addLocationAction,
  createAccountAction,
  inviteToClientAction,
  setClientStatusAction,
  startImpersonationAction,
  updateClientAction,
} from "../actions";
import {
  addLocationSchema,
  createAccountSchema,
  inviteToClientSchema,
  updateClientSchema,
} from "../client-schemas";
import { AccountCredentials } from "./account-credentials";

type Result = { ok: boolean; error?: { message: string } };

export function ClientActions({
  organization,
  canManage,
  canImpersonate,
}: {
  organization: Organization;
  canManage: boolean;
  canImpersonate: boolean;
}) {
  const t = useTranslations("adm");
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<Result>, success?: string) =>
    startTransition(async () => {
      const result = await action();
      if (!result.ok) toast.error(result.error?.message);
      else if (success) toast.success(success);
    });
  const setStatus = (status: OrganizationStatus) =>
    run(() => setClientStatusAction({ organizationId: organization.id, status }), t("common.saved"));

  return (
    <div className="flex flex-wrap gap-2">
      {canImpersonate && organization.status !== "ARCHIVED" && (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => run(() => startImpersonationAction({ organizationId: organization.id }))}
        >
          <Eye data-icon="inline-start" />
          {t("clients.detail.impersonate")}
        </Button>
      )}
      {canManage && <EditClientDialog organization={organization} />}
      {canManage && organization.status !== "ACTIVE" && (
        <Button variant="outline" disabled={pending} onClick={() => setStatus("ACTIVE")}>
          <Play data-icon="inline-start" />
          {t("clients.detail.activate")}
        </Button>
      )}
      {canManage && organization.status === "ACTIVE" && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" disabled={pending}>
              <Pause data-icon="inline-start" />
              {t("clients.detail.suspend")}
            </Button>
          }
          title={t("clients.detail.suspendTitle")}
          description={t("clients.detail.suspendText")}
          confirmLabel={t("clients.detail.suspend")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => setStatus("SUSPENDED")}
        />
      )}
      {canManage && organization.status !== "ARCHIVED" && (
        <ConfirmDialog
          trigger={
            <Button variant="destructive" disabled={pending}>
              <Archive data-icon="inline-start" />
              {t("clients.detail.archive")}
            </Button>
          }
          title={t("clients.detail.archiveTitle")}
          description={t("clients.detail.archiveText")}
          confirmLabel={t("clients.detail.archive")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => setStatus("ARCHIVED")}
        />
      )}
    </div>
  );
}

function EditClientDialog({ organization }: { organization: Organization }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  type Values = z.input<typeof updateClientSchema>;
  const form = useForm<Values, unknown, z.output<typeof updateClientSchema>>({
    resolver: zodResolver(updateClientSchema),
    defaultValues: {
      organizationId: organization.id,
      name: organization.name,
      contactName: organization.contactName ?? "",
      contactPhone: organization.contactPhone ?? "",
      contactEmail: organization.contactEmail ?? "",
    },
  });
  const fields = ["name", "contactName", "contactPhone", "contactEmail"] as const;

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const result = await updateClientAction(form.getValues());
      if (result.ok) {
        toast.success(t("adm.common.saved"));
        setOpen(false);
      } else setFormError(applyActionError(result.error, form.setError, fields));
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil data-icon="inline-start" />
          {t("adm.clients.detail.editOrg")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adm.clients.detail.editOrg")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-3">
          {formError && <FormAlert>{formError}</FormAlert>}
          {fields.map((field) => (
            <FormField
              key={field}
              label={t(`settings.organization.${field}`)}
              error={form.formState.errors[field]?.message}
            >
              <Input {...form.register(field)} />
            </FormField>
          ))}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {t("adm.common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AddLocationDialog({ organizationId }: { organizationId: string }) {
  const t = useTranslations("adm");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  type Values = z.input<typeof addLocationSchema>;
  const form = useForm<Values, unknown, z.output<typeof addLocationSchema>>({
    resolver: zodResolver(addLocationSchema),
    defaultValues: { organizationId, name: "", address: "", twogisUrl: "" },
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const result = await addLocationAction(form.getValues());
      if (result.ok) {
        toast.success(t("common.saved"));
        form.reset();
        setOpen(false);
      } else setFormError(applyActionError(result.error, form.setError, ["name", "address", "twogisUrl"]));
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          {t("clients.detail.addLocation")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("clients.detail.addLocation")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-3">
          {formError && <FormAlert>{formError}</FormAlert>}
          <FormField label={t("clients.wizard.locationName")} error={form.formState.errors.name?.message}>
            <Input {...form.register("name")} />
          </FormField>
          <FormField label={t("clients.wizard.address")} error={form.formState.errors.address?.message}>
            <Input {...form.register("address")} />
          </FormField>
          <FormField label={t("clients.wizard.twogisUrl")} error={form.formState.errors.twogisUrl?.message}>
            <Input placeholder={t("clients.wizard.twogisPlaceholder")} {...form.register("twogisUrl")} />
          </FormField>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Creates a login for a person of the client; the temporary password is shown once, to be sent by hand. */
export function CreateAccountDialog({ organizationId }: { organizationId: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [account, setAccount] = useState<CreatedAccount | null>(null);
  type Values = z.input<typeof createAccountSchema>;
  const form = useForm<Values, unknown, z.output<typeof createAccountSchema>>({
    resolver: zodResolver(createAccountSchema),
    defaultValues: { organizationId, email: "", name: "", role: "MANAGER" },
  });
  const role = useWatch({ control: form.control, name: "role" });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const result = await createAccountAction(form.getValues());
      if (result.ok) {
        setAccount(result.data);
        form.reset({ organizationId, email: "", name: "", role: "MANAGER" });
      } else setFormError(applyActionError(result.error, form.setError, ["email", "name"]));
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setAccount(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus data-icon="inline-start" />
          {t("adm.accounts.create")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adm.accounts.title")}</DialogTitle>
        </DialogHeader>
        {account ? (
          <div className="grid gap-4">
            <AccountCredentials account={account} />
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>{t("adm.accounts.done")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-3">
            {formError && <FormAlert>{formError}</FormAlert>}
            <FormField label={t("adm.accounts.name")} error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} />
            </FormField>
            <FormField label={t("team.email")} error={form.formState.errors.email?.message}>
              <Input type="email" {...form.register("email")} />
            </FormField>
            <FormField label={t("team.role")}>
              <Select value={role} onValueChange={(value) => form.setValue("role", value as Values["role"])}>
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
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {t("adm.accounts.submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** An invitation link for someone who should join the client's cabinet by themselves. */
export function InviteToClientDialog({ organizationId }: { organizationId: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  type Values = z.input<typeof inviteToClientSchema>;
  const form = useForm<Values, unknown, z.output<typeof inviteToClientSchema>>({
    resolver: zodResolver(inviteToClientSchema),
    defaultValues: { organizationId, email: "", role: "MANAGER" },
  });
  const role = useWatch({ control: form.control, name: "role" });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const result = await inviteToClientAction(form.getValues());
      if (result.ok) {
        setLink(result.data.link);
        form.reset({ organizationId, email: "", role: "MANAGER" });
      } else setFormError(applyActionError(result.error, form.setError, ["email"]));
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
        <Button size="sm" variant="outline">
          <Link2 data-icon="inline-start" />
          {t("team.invite")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("team.inviteTitle")}</DialogTitle>
        </DialogHeader>
        {link ? (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">{t("team.linkHint")}</p>
            <CopyField label={t("team.linkLabel")} value={link} testId="invitation-link" />
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>{t("adm.accounts.done")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-3">
            {formError && <FormAlert>{formError}</FormAlert>}
            <FormField label={t("team.email")} error={form.formState.errors.email?.message}>
              <Input type="email" {...form.register("email")} />
            </FormField>
            <FormField label={t("team.role")}>
              <Select value={role} onValueChange={(value) => form.setValue("role", value as Values["role"])}>
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
            <DialogFooter>
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
