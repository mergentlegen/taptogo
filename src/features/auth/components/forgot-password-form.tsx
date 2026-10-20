"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyActionError } from "@/lib/forms";

import { requestPasswordResetAction } from "../actions";
import { forgotPasswordSchema } from "../schemas";

type Values = z.input<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values, unknown, z.output<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setFormError(null);
      const result = await requestPasswordResetAction(values);
      if (result.ok) setSent(true);
      else setFormError(applyActionError(result.error, form.setError, ["email"]));
    }),
  );

  if (sent) return <FormAlert variant="success">{t("forgot.sent")}</FormAlert>;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField label={t("fields.email")} error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" autoFocus {...form.register("email")} />
      </FormField>
      <Button type="submit" size="lg" disabled={pending}>
        {t("forgot.submit")}
      </Button>
    </form>
  );
}
