"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Plus, Search, Star, Trash2 } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useFieldArray, useForm, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PlanConfig } from "@/features/platform/schemas";
import { formatKzt, formatNumber, formatRating } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FirmPreview } from "@/server/providers/reviews/types";

import { createClientAction, resolveTwogisAction } from "../actions";
import { createClientSchema } from "../client-schemas";

type Values = z.input<typeof createClientSchema>;
const STEPS = ["organization", "locations", "owner", "plan"] as const;

/** Fields validated before leaving each step. */
const STEP_FIELDS: Record<(typeof STEPS)[number], FieldPath<Values>[]> = {
  organization: [
    "organization.name",
    "organization.legalName",
    "organization.bin",
    "organization.contactName",
    "organization.contactPhone",
    "organization.contactEmail",
  ],
  locations: ["locations"],
  owner: ["owner.email"],
  plan: ["subscription.plan", "subscription.paidUntil"],
};

export function ClientWizard({ plans, defaultPaidUntil }: { plans: PlanConfig[]; defaultPaidUntil: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<number, FirmPreview | "missing">>({});
  const form = useForm<Values, unknown, z.output<typeof createClientSchema>>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      organization: { name: "", legalName: "", bin: "", contactName: "", contactPhone: "", contactEmail: "" },
      locations: [{ name: "", address: "", twogisUrl: "" }],
      owner: { email: "" },
      subscription: { plan: "BUSINESS", paidUntil: defaultPaidUntil, trial: true },
    },
  });
  const locations = useFieldArray({ control: form.control, name: "locations" });
  const { errors } = form.formState;
  const current = STEPS[step] ?? "organization";

  const next = async () => {
    if (await form.trigger(STEP_FIELDS[current])) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const preview = (index: number) =>
    startTransition(async () => {
      const url = form.getValues(`locations.${index}.twogisUrl`);
      if (!url) return;
      const result = await resolveTwogisAction({ url });
      setPreviews((p) => ({ ...p, [index]: result.ok && result.data ? result.data : "missing" }));
      const data = result.ok ? result.data : null;
      if (data && !form.getValues(`locations.${index}.address`)) {
        form.setValue(`locations.${index}.address`, data.address);
      }
    });

  const submit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const result = await createClientAction(form.getValues());
      if (result.ok) {
        if (result.data.inviteSent) toast.success(t("adm.clients.wizard.created"));
        else toast.warning(t("adm.clients.wizard.createdNoEmail"));
        router.push(`/admin/organizations/${result.data.id}` as Route);
      } else {
        setFormError(result.error.message);
      }
    }),
  );

  const text = (name: FieldPath<Values>, label: string, props: React.ComponentProps<typeof Input> = {}) => {
    const error = name
      .split(".")
      .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], errors) as
      { message?: string } | undefined;
    return (
      <FormField label={label} error={error?.message}>
        <Input {...props} {...form.register(name)} />
      </FormField>
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <ol className="flex gap-2 lg:flex-col" aria-label={t("adm.clients.wizard.title")}>
        {STEPS.map((s, index) => (
          <li
            key={s}
            aria-current={index === step ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm",
              index === step ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                index < step && "border-primary bg-primary text-primary-foreground",
              )}
            >
              {index < step ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
            </span>
            <span className="hidden sm:inline">{t(`adm.clients.wizard.steps.${s}`)}</span>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle>{t(`adm.clients.wizard.steps.${current}`)}</CardTitle>
          {current === "organization" && (
            <CardDescription>{t("adm.clients.wizard.organizationHint")}</CardDescription>
          )}
          {current === "locations" && (
            <CardDescription>{t("adm.clients.wizard.locationsHint")}</CardDescription>
          )}
          {current === "owner" && <CardDescription>{t("adm.clients.wizard.ownerHint")}</CardDescription>}
        </CardHeader>
        <CardContent className="grid gap-4">
          {formError && <FormAlert>{formError}</FormAlert>}

          {current === "organization" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                {text("organization.name", t("settings.organization.name"))}
              </div>
              <div className="sm:col-span-2">
                {text("organization.legalName", t("settings.organization.legalName"))}
              </div>
              {text("organization.bin", t("settings.organization.bin"), { inputMode: "numeric" })}
              {text("organization.contactName", t("settings.organization.contactName"))}
              {text("organization.contactPhone", t("settings.organization.contactPhone"), {
                type: "tel",
                placeholder: "+77001234567",
              })}
              {text("organization.contactEmail", t("settings.organization.contactEmail"), { type: "email" })}
            </div>
          )}

          {current === "locations" && (
            <div className="grid gap-4">
              {locations.fields.map((field, index) => {
                const found = previews[index];
                return (
                  <div
                    key={field.id}
                    className="grid gap-3 rounded-xl border p-4"
                    data-testid="wizard-location"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      {text(`locations.${index}.name`, t("adm.clients.wizard.locationName"))}
                      {text(`locations.${index}.address`, t("adm.clients.wizard.address"))}
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        {text(`locations.${index}.twogisUrl`, t("adm.clients.wizard.twogisUrl"), {
                          placeholder: t("adm.clients.wizard.twogisPlaceholder"),
                        })}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={pending}
                        onClick={() => preview(index)}
                      >
                        <Search data-icon="inline-start" />
                        {t("adm.clients.wizard.preview")}
                      </Button>
                    </div>
                    {found === "missing" && <FormAlert>{t("adm.clients.wizard.previewNotFound")}</FormAlert>}
                    {found && found !== "missing" && (
                      <div
                        className="flex items-center gap-3 rounded-lg bg-muted p-3 text-sm"
                        data-testid="twogis-preview"
                      >
                        <Star className="size-4 fill-chart-2 text-chart-2" aria-hidden="true" />
                        <div>
                          <p className="font-medium">{found.name}</p>
                          <p className="text-muted-foreground">
                            {found.address} ·{" "}
                            {t("adm.clients.wizard.previewRating", {
                              rating: found.rating === null ? "—" : formatRating(found.rating),
                              count: found.reviewCount === null ? "—" : formatNumber(found.reviewCount),
                            })}
                          </p>
                        </div>
                      </div>
                    )}
                    {locations.fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="justify-self-start"
                        onClick={() => locations.remove(index)}
                      >
                        <Trash2 data-icon="inline-start" />
                        {t("adm.clients.wizard.removeLocation")}
                      </Button>
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                variant="outline"
                className="justify-self-start"
                onClick={() => locations.append({ name: "", address: "", twogisUrl: "" })}
              >
                <Plus data-icon="inline-start" />
                {t("adm.clients.wizard.addLocation")}
              </Button>
            </div>
          )}

          {current === "owner" && (
            <div className="max-w-md">
              {text("owner.email", t("adm.clients.wizard.ownerEmail"), { type: "email" })}
            </div>
          )}

          {current === "plan" && (
            <div className="grid max-w-md gap-4">
              <Controller
                control={form.control}
                name="subscription.plan"
                render={({ field }) => (
                  <FormField label={t("adm.clients.wizard.plan")}>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {plans.map((p) => (
                          <SelectItem key={p.plan} value={p.plan}>
                            {t(`subscription.plans.${p.plan}`)} · {p.cardLimit} ·{" "}
                            {formatKzt(p.monthlyPriceKzt)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
              />
              {text("subscription.paidUntil", t("adm.clients.wizard.paidUntil"), { type: "date" })}
              <Controller
                control={form.control}
                name="subscription.trial"
                render={({ field }) => (
                  <div className="flex items-center gap-3">
                    <Switch id="wizard-trial" checked={field.value} onCheckedChange={field.onChange} />
                    <Label htmlFor="wizard-trial">{t("adm.clients.wizard.trial")}</Label>
                  </div>
                )}
              />
            </div>
          )}

          <div className="flex justify-between gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
            >
              {t("adm.clients.wizard.back")}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={next}>
                {t("adm.clients.wizard.next")}
              </Button>
            ) : (
              <Button type="button" disabled={pending} onClick={submit}>
                {t("adm.clients.wizard.finish")}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
