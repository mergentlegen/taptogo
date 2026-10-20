"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { paymentMethods, plans } from "@/features/subscriptions/schemas";
import { formatDateTime, formatIsoDate, formatKzt } from "@/lib/format";
import { applyActionError } from "@/lib/forms";
import type { SubscriptionRow } from "@/server/services/admin/billing-service";

import { recordPaymentAction, updateSubscriptionAction } from "../actions";
import { recordPaymentSchema, updateSubscriptionSchema } from "../schemas";
import { SubscriptionBadge } from "./badges";

type PaymentRow = {
  id: string;
  organization: string;
  amountKzt: number;
  method: (typeof paymentMethods)[number];
  paidAt: string;
  comment: string | null;
};

export function BillingManager({
  subscriptions,
  payments,
  canManage,
  today,
}: {
  subscriptions: SubscriptionRow[];
  payments: PaymentRow[];
  canManage: boolean;
  today: string;
}) {
  const t = useTranslations();

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">{t("adm.billing.subscriptions")}</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adm.billing.columns.client")}</TableHead>
                <TableHead>{t("adm.billing.columns.plan")}</TableHead>
                <TableHead className="text-right">{t("adm.billing.columns.limit")}</TableHead>
                <TableHead>{t("adm.billing.columns.paidUntil")}</TableHead>
                <TableHead>{t("adm.billing.columns.status")}</TableHead>
                {canManage && (
                  <TableHead>
                    <span className="sr-only">{t("adm.common.actions")}</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.map((s) => (
                <TableRow key={s.organizationId} data-testid="subscription-row">
                  <TableCell className="font-medium">{s.organization}</TableCell>
                  <TableCell>{t(`subscription.plans.${s.plan}`)}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.cardLimit}</TableCell>
                  <TableCell className="tabular-nums">{formatIsoDate(s.paidUntil, "long")}</TableCell>
                  <TableCell>
                    <SubscriptionBadge status={s.status} />
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <PaymentDialog subscription={s} today={today} />
                        <SubscriptionDialog subscription={s} />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">{t("adm.billing.payments")}</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adm.billing.columns.date")}</TableHead>
                <TableHead>{t("adm.billing.columns.client")}</TableHead>
                <TableHead className="text-right">{t("adm.billing.columns.amount")}</TableHead>
                <TableHead>{t("adm.billing.columns.method")}</TableHead>
                <TableHead>{t("adm.billing.columns.comment")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="tabular-nums">{formatDateTime(p.paidAt)}</TableCell>
                  <TableCell>{p.organization}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatKzt(p.amountKzt)}</TableCell>
                  <TableCell>{t(`adm.methods.${p.method}`)}</TableCell>
                  <TableCell className="text-muted-foreground">{p.comment ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function PaymentDialog({ subscription, today }: { subscription: SubscriptionRow; today: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof recordPaymentSchema>, unknown, z.output<typeof recordPaymentSchema>>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      organizationId: subscription.organizationId,
      amountKzt: subscription.monthlyPriceKzt ?? 0,
      method: "KASPI",
      paidOn: today,
      months: 1,
      comment: "",
    },
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const result = await recordPaymentAction(form.getValues());
      if (result.ok) {
        toast.success(t("adm.billing.recorded", { date: formatIsoDate(result.data.paidUntil, "long") }));
        setOpen(false);
      } else
        setFormError(
          applyActionError(result.error, form.setError, ["amountKzt", "paidOn", "months", "comment"]),
        );
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Wallet data-icon="inline-start" />
          {t("adm.billing.record")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adm.billing.recordTitle")}</DialogTitle>
          <DialogDescription>{subscription.organization}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-3">
          {formError && <FormAlert>{formError}</FormAlert>}
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("adm.billing.amount")} error={form.formState.errors.amountKzt?.message}>
              <Input type="number" min={1} {...form.register("amountKzt")} />
            </FormField>
            <Controller
              control={form.control}
              name="method"
              render={({ field }) => (
                <FormField label={t("adm.billing.method")}>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethods.map((m) => (
                        <SelectItem key={m} value={m}>
                          {t(`adm.methods.${m}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
            />
            <FormField label={t("adm.billing.paidOn")} error={form.formState.errors.paidOn?.message}>
              <Input type="date" max={today} {...form.register("paidOn")} />
            </FormField>
            <FormField label={t("adm.billing.months")} error={form.formState.errors.months?.message}>
              <Input type="number" min={1} max={24} {...form.register("months")} />
            </FormField>
          </div>
          <FormField label={t("adm.billing.comment")}>
            <Input {...form.register("comment")} />
          </FormField>
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

function SubscriptionDialog({ subscription }: { subscription: SubscriptionRow }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<
    z.input<typeof updateSubscriptionSchema>,
    unknown,
    z.output<typeof updateSubscriptionSchema>
  >({
    resolver: zodResolver(updateSubscriptionSchema),
    defaultValues: {
      organizationId: subscription.organizationId,
      plan: subscription.plan,
      cardLimit: subscription.cardLimit,
      paidUntil: subscription.paidUntil,
      trial: subscription.storedStatus === "TRIAL",
    },
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      const result = await updateSubscriptionAction(form.getValues());
      if (result.ok) {
        toast.success(t("adm.common.saved"));
        setOpen(false);
      } else setFormError(applyActionError(result.error, form.setError, ["cardLimit", "paidUntil"]));
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`${t("adm.billing.editSubscription")}: ${subscription.organization}`}
        >
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adm.billing.editSubscription")}</DialogTitle>
          <DialogDescription>{subscription.organization}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-3">
          {formError && <FormAlert>{formError}</FormAlert>}
          <Controller
            control={form.control}
            name="plan"
            render={({ field }) => (
              <FormField label={t("adm.billing.plan")}>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((p) => (
                      <SelectItem key={p} value={p}>
                        {t(`subscription.plans.${p}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t("adm.billing.cardLimit")} error={form.formState.errors.cardLimit?.message}>
              <Input type="number" min={0} {...form.register("cardLimit")} />
            </FormField>
            <FormField label={t("adm.billing.paidUntil")} error={form.formState.errors.paidUntil?.message}>
              <Input type="date" {...form.register("paidUntil")} />
            </FormField>
          </div>
          <Controller
            control={form.control}
            name="trial"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <Switch
                  id={`trial-${subscription.organizationId}`}
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
                <Label htmlFor={`trial-${subscription.organizationId}`}>{t("adm.billing.trial")}</Label>
              </div>
            )}
          />
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
