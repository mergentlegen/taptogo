"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PlatformSettings } from "@/features/platform/schemas";

import { updateSettingsAction } from "../actions";
import { platformSettingsFormSchema } from "../schemas";

export function PlatformSettingsForm({ settings }: { settings: PlatformSettings }) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<
    z.input<typeof platformSettingsFormSchema>,
    unknown,
    z.output<typeof platformSettingsFormSchema>
  >({
    resolver: zodResolver(platformSettingsFormSchema),
    defaultValues: {
      domains: settings.allowedRedirectDomains.join("\n"),
      graceDays: settings.graceDays,
      plans: settings.plans,
    },
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const result = await updateSettingsAction(form.getValues());
      if (result.ok) toast.success(t("adm.settings.saved"));
      else setFormError(result.error.message);
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-3xl gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("adm.settings.domains")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FormField label={t("adm.settings.domains")} hint={t("adm.settings.domainsHint")}>
            <Textarea rows={7} className="font-mono" {...form.register("domains")} />
          </FormField>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("adm.settings.grace")}</CardTitle>
        </CardHeader>
        <CardContent>
          <FormField
            label={t("adm.settings.grace")}
            error={form.formState.errors.graceDays?.message}
            className="max-w-40"
          >
            <Input type="number" min={0} max={60} {...form.register("graceDays")} />
          </FormField>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("adm.settings.plans")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {settings.plans.map((plan, index) => (
            <div key={plan.plan} className="grid grid-cols-[8rem_1fr_1fr] items-end gap-3">
              <p className="pb-2 font-medium">{t(`subscription.plans.${plan.plan}`)}</p>
              <FormField label={t("adm.settings.cardLimit")}>
                <Input type="number" min={1} {...form.register(`plans.${index}.cardLimit`)} />
              </FormField>
              <FormField label={t("adm.settings.price")}>
                <Input type="number" min={0} {...form.register(`plans.${index}.monthlyPriceKzt`)} />
              </FormField>
            </div>
          ))}
        </CardContent>
      </Card>
      <div>
        <Button type="submit" disabled={pending}>
          {t("adm.common.save")}
        </Button>
      </div>
    </form>
  );
}
