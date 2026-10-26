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
import { Input } from "@/components/ui/input";
import { applyActionError } from "@/lib/forms";

import { updateOrganizationAction } from "../actions";
import { organizationSchema } from "../form-schemas";

type Values = z.input<typeof organizationSchema>;
const FIELDS = ["name", "legalName", "bin", "contactName", "contactPhone", "contactEmail"] as const;

export function OrganizationForm({ values, readOnly }: { values: Values; readOnly: boolean }) {
  const t = useTranslations("settings.organization");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values, unknown, z.output<typeof organizationSchema>>({
    resolver: zodResolver(organizationSchema),
    defaultValues: values,
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const result = await updateOrganizationAction(form.getValues());
      if (result.ok) toast.success(t("saved"));
      else setFormError(applyActionError(result.error, form.setError, FIELDS));
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-xl gap-4">
      {readOnly && <FormAlert variant="info">{t("readOnly")}</FormAlert>}
      {formError && <FormAlert>{formError}</FormAlert>}
      <fieldset disabled={readOnly || pending} className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <FormField
            key={field}
            label={t(field)}
            error={form.formState.errors[field]?.message}
            className={field === "name" || field === "legalName" ? "sm:col-span-2" : undefined}
          >
            <Input
              type={field === "contactEmail" ? "email" : field === "contactPhone" ? "tel" : "text"}
              {...form.register(field)}
            />
          </FormField>
        ))}
      </fieldset>
      {!readOnly && (
        <div>
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
        </div>
      )}
    </form>
  );
}
