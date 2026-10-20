"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";

import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyActionError } from "@/lib/forms";

import { signInAction } from "../actions";
import { signInSchema } from "../schemas";

type Values = z.input<typeof signInSchema>;

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values, unknown, z.output<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "", next },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      // On success the action redirects; we only get here on failure.
      const result = await signInAction(values);
      if (!result.ok) {
        setFormError(applyActionError(result.error, form.setError, ["email", "password"]));
        form.resetField("password");
      }
    });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField label={t("fields.email")} error={errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" autoFocus {...form.register("email")} />
      </FormField>
      <FormField label={t("fields.password")} error={errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...form.register("password")} />
      </FormField>
      <Button type="submit" size="lg" disabled={pending}>
        {t("login.submit")}
      </Button>
      <Link
        href="/forgot-password"
        className="text-center text-sm text-muted-foreground hover:text-foreground"
      >
        {t("login.forgot")}
      </Link>
    </form>
  );
}
