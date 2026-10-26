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
      <div>
        <Button type="submit" disabled={pending}>
          {t("adm.common.save")}
        </Button>
      </div>
    </form>
  );
}
