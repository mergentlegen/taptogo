"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleOff, Pause, Pencil, Play } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { applyActionError } from "@/lib/forms";
import type { CardDetail } from "@/server/services/card-service";

import { reportCardLostAction, setCardPausedAction, updateCardAction } from "../actions";
import { updateCardSchema } from "../form-schemas";

const NONE = "none";
type Values = z.input<typeof updateCardSchema>;

export function CardActions({ detail }: { detail: CardDetail }) {
  const t = useTranslations("cards");
  const [pending, startTransition] = useTransition();
  const { card } = detail;
  const editable = card.status === "ACTIVE" || card.status === "PAUSED";

  const run = (action: () => Promise<{ ok: boolean; error?: { message: string } }>, success: string) =>
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error?.message);
    });

  return (
    <div className="flex flex-wrap gap-2">
      <EditCardDialog detail={detail} />
      {editable &&
        (card.status === "ACTIVE" ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(() => setCardPausedAction({ cardId: card.id, paused: true }), t("actions.paused"))
            }
          >
            <Pause data-icon="inline-start" />
            {t("actions.pause")}
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(() => setCardPausedAction({ cardId: card.id, paused: false }), t("actions.resumed"))
            }
          >
            <Play data-icon="inline-start" />
            {t("actions.resume")}
          </Button>
        ))}
      {editable && (
        <ConfirmDialog
          trigger={
            <Button variant="destructive" disabled={pending}>
              <CircleOff data-icon="inline-start" />
              {t("actions.reportLost")}
            </Button>
          }
          title={t("actions.lostTitle")}
          description={t("actions.lostText", { label: card.label })}
          confirmLabel={t("actions.lostConfirm")}
          cancelLabel={t("actions.cancel")}
          onConfirm={() => run(() => reportCardLostAction({ cardId: card.id }), t("actions.lost"))}
        />
      )}
    </div>
  );
}

function EditCardDialog({ detail }: { detail: CardDetail }) {
  const t = useTranslations("cards.actions");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const { card, options } = detail;
  const form = useForm<Values, unknown, z.output<typeof updateCardSchema>>({
    resolver: zodResolver(updateCardSchema),
    defaultValues: {
      cardId: card.id,
      label: card.label,
      locationId: card.locationId ?? "",
      employeeId: card.employeeId ?? "",
    },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setFormError(null);
      const result = await updateCardAction(values);
      if (result.ok) {
        toast.success(t("saved"));
        setOpen(false);
      } else {
        setFormError(applyActionError(result.error, form.setError, ["label"]));
      }
    }),
  );

  const select = (
    name: "locationId" | "employeeId",
    label: string,
    items: { id: string; name: string }[],
    hint?: string,
  ) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField label={label} hint={hint} error={fieldState.error?.message}>
          <Select
            value={field.value ? field.value : NONE}
            onValueChange={(v) => {
              field.onChange(v === NONE ? "" : v);
              if (name === "locationId") form.setValue("employeeId", "");
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Выберите заведение" />
            </SelectTrigger>
            <SelectContent>
              {name === "employeeId" && <SelectItem value={NONE}>{t("none")}</SelectItem>}
              {items.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}
    />
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (value) {
          form.reset({
            cardId: card.id,
            label: card.label,
            locationId: card.locationId ?? "",
            employeeId: card.employeeId ?? "",
          });
          setFormError(null);
        }
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Pencil data-icon="inline-start" />
          {t("edit")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {formError && <FormAlert>{formError}</FormAlert>}
          <FormField label={t("label")} hint={t("labelHint")} error={form.formState.errors.label?.message}>
            <Input autoComplete="off" {...form.register("label")} />
          </FormField>
          {select(
            "locationId",
            t("location"),
            options.locations.map((l) => ({
              id: l.id,
              name: `${l.name} · ${l.address}`,
            })),
            t("targetHint"),
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
