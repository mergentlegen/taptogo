"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Pencil, Plus, QrCode, Trash2 } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { cardTypes } from "@/features/cards/schemas";
import { applyActionError } from "@/lib/forms";

import { createBatchAction, deleteBatchAction, flashCardAction, updateBatchAction } from "../actions";
import { createBatchSchema, updateBatchSchema } from "../card-schemas";

export function CreateBatchDialog() {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof createBatchSchema>, unknown, z.output<typeof createBatchSchema>>({
    resolver: zodResolver(createBatchSchema),
    defaultValues: { name: "", quantity: 50, cardType: "NFC_CARD", notes: "" },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await createBatchAction(form.getValues());
      if (result.ok) {
        toast.success(t("adm.batches.created", { count: values.quantity }));
        setOpen(false);
        router.push(`/admin/batches/${result.data.id}` as Route);
      } else setFormError(applyActionError(result.error, form.setError, ["name", "quantity", "notes"]));
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          {t("adm.batches.new")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adm.batches.new")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-3">
          {formError && <FormAlert>{formError}</FormAlert>}
          <FormField label={t("adm.batches.name")} error={form.formState.errors.name?.message}>
            <Input {...form.register("name")} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("adm.batches.quantity")} error={form.formState.errors.quantity?.message}>
              <Input type="number" min={1} max={2000} {...form.register("quantity")} />
            </FormField>
            <Controller
              control={form.control}
              name="cardType"
              render={({ field }) => (
                <FormField label={t("adm.batches.type")}>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {cardTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`cards.types.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            />
          </div>
          <FormField label={t("adm.batches.notes")}>
            <Textarea rows={3} {...form.register("notes")} />
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

type FlashCard = {
  id: string;
  number: number;
  code: string;
  url: string;
  nfcWritten: boolean;
  nfcLocked: boolean;
  type: string;
};

/** One row of the flashing checklist: copy URL, check the QR, tick written/locked. */
export function FlashRow({ card, canManage }: { card: FlashCard; canManage: boolean }) {
  const t = useTranslations("adm");
  const [pending, startTransition] = useTransition();
  const [showQr, setShowQr] = useState(false);

  const mark = (state: { nfcWritten?: boolean; nfcLocked?: boolean }) =>
    startTransition(async () => {
      const result = await flashCardAction({ cardId: card.id, ...state });
      if (!result.ok) toast.error(result.error.message);
    });

  return (
    <li
      className="grid gap-2 p-3 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-center"
      data-testid="flash-row"
    >
      <span className="text-sm text-muted-foreground tabular-nums">№{card.number}</span>
      <div className="min-w-0">
        <p className="font-mono text-sm">{card.code}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{card.url}</p>
        {showQr && (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin SVG from an authenticated route
          <img
            src={`/admin/cards/${card.id}/qr`}
            alt={card.code}
            className="mt-2 size-32 rounded bg-white p-1"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(card.url);
            toast.success(t("common.copied"));
          }}
        >
          <Copy data-icon="inline-start" />
          {t("common.copy")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowQr((v) => !v)} aria-pressed={showQr}>
          <QrCode data-icon="inline-start" />
          {t("flash.showQr")}
        </Button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:w-60">
          {card.type !== "QR_ONLY" && (
            <>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={card.nfcWritten}
                  disabled={!canManage || pending}
                  onChange={(e) => mark({ nfcWritten: e.target.checked })}
                />
                {t("flash.written")}
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={card.nfcLocked}
                  disabled={!canManage || pending}
                  onChange={(e) => mark({ nfcLocked: e.target.checked })}
                />
                {t("flash.locked")}
              </label>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/** Rename or delete a batch. Deleting works only while no card of it was handed out. */
export function BatchActions({
  batch,
  redirectTo,
}: {
  batch: { id: string; name: string; notes: string | null };
  /** Where to go after deleting (null: stay and refresh the list). */
  redirectTo: Route | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof updateBatchSchema>, unknown, z.output<typeof updateBatchSchema>>({
    resolver: zodResolver(updateBatchSchema),
    defaultValues: { batchId: batch.id, name: batch.name, notes: batch.notes ?? "" },
  });

  const save = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const result = await updateBatchAction(form.getValues());
      if (result.ok) {
        toast.success(t("adm.batches.saved"));
        setOpen(false);
        router.refresh();
      } else setFormError(applyActionError(result.error, form.setError, ["name", "notes"]));
    }),
  );

  const remove = () =>
    startTransition(async () => {
      const result = await deleteBatchAction({ batchId: batch.id });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(t("adm.batches.deleted"));
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost">
            <Pencil data-icon="inline-start" />
            {t("adm.batches.edit")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("adm.batches.editTitle")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} noValidate className="grid gap-3">
            {formError && <FormAlert>{formError}</FormAlert>}
            <FormField label={t("adm.batches.name")} error={form.formState.errors.name?.message}>
              <Input {...form.register("name")} />
            </FormField>
            <FormField label={t("adm.batches.notes")}>
              <Textarea rows={3} {...form.register("notes")} />
            </FormField>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {t("adm.common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        trigger={
          <Button size="sm" variant="ghost" disabled={pending}>
            <Trash2 data-icon="inline-start" />
            {t("adm.batches.delete")}
          </Button>
        }
        title={t("adm.batches.deleteTitle")}
        description={t("adm.batches.deleteText", { name: batch.name })}
        confirmLabel={t("adm.batches.deleteConfirm")}
        cancelLabel={t("adm.common.cancel")}
        onConfirm={remove}
      />
    </>
  );
}
