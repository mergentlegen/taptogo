"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { applyActionError } from "@/lib/forms";

import { submitLeadAction } from "../actions";
import { submitLeadSchema } from "../schemas";

const FIELDS = ["name", "phone", "businessName", "city", "message"] as const;

export function LeadForm() {
  const t = useTranslations("public.contact");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof submitLeadSchema>, unknown, z.output<typeof submitLeadSchema>>({
    resolver: zodResolver(submitLeadSchema),
    defaultValues: { name: "", phone: "", businessName: "", city: "", message: "", website: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const result = await submitLeadAction(form.getValues());
      if (result.ok) {
        form.reset();
        setSent(true);
      } else {
        setFormError(applyActionError(result.error, form.setError, FIELDS));
      }
    }),
  );

  if (sent) {
    return (
      <div role="status" className="grid justify-items-start gap-3 py-6" data-testid="lead-sent">
        <CircleCheck className="size-10 text-success" aria-hidden="true" />
        <p className="text-lg font-semibold">{t("successTitle")}</p>
        <p className="text-muted-foreground">{t("successText")}</p>
        <Button variant="outline" onClick={() => setSent(false)}>
          {t("another")}
        </Button>
      </div>
    );
  }

  const optional = (label: string) => `${label} (${t("optional")})`;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4" aria-label={t("title")}>
      {formError && <FormAlert>{formError}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t("name")} error={errors.name?.message}>
          <Input autoComplete="name" maxLength={120} {...form.register("name")} />
        </FormField>
        <FormField label={t("phone")} error={errors.phone?.message}>
          <Input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            maxLength={24}
            placeholder={t("phonePlaceholder")}
            {...form.register("phone")}
          />
        </FormField>
        <FormField label={t("businessName")} error={errors.businessName?.message}>
          <Input autoComplete="organization" maxLength={160} {...form.register("businessName")} />
        </FormField>
        <FormField label={optional(t("city"))} error={errors.city?.message}>
          <Input autoComplete="address-level2" maxLength={80} {...form.register("city")} />
        </FormField>
      </div>
      <FormField label={optional(t("message"))} error={errors.message?.message}>
        <Textarea
          rows={3}
          maxLength={2000}
          placeholder={t("messagePlaceholder")}
          {...form.register("message")}
        />
      </FormField>
      {/* Honeypot: off-screen and skipped by keyboard and screen readers; only bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          {t("honeypot")}
          <input type="text" tabIndex={-1} autoComplete="off" {...form.register("website")} />
        </label>
      </div>
      <div className="grid gap-3 sm:flex sm:items-center sm:gap-4">
        <Button type="submit" size="lg" disabled={pending}>
          {t("submit")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("consent")}</p>
      </div>
    </form>
  );
}
