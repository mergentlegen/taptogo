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

import { changePasswordAction, updateProfileAction } from "../actions";
import { changePasswordSchema, profileSchema } from "../form-schemas";

export function ProfileForm({ name, phone, email }: { name: string; phone: string | null; email: string }) {
  const t = useTranslations("settings.profile");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof profileSchema>, unknown, z.output<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name, phone: phone ?? "" },
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const result = await updateProfileAction(form.getValues());
      if (result.ok) toast.success(t("saved"));
      else setFormError(applyActionError(result.error, form.setError, ["name", "phone"]));
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-md gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField label={t("name")} error={form.formState.errors.name?.message}>
        <Input autoComplete="name" {...form.register("name")} />
      </FormField>
      <FormField label={t("phone")} hint={t("phoneHint")} error={form.formState.errors.phone?.message}>
        <Input type="tel" autoComplete="tel" inputMode="tel" {...form.register("phone")} />
      </FormField>
      <FormField label={t("email")} hint={t("emailHint")}>
        <Input value={email} readOnly disabled />
      </FormField>
      <div>
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const t = useTranslations("settings.password");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof changePasswordSchema>, unknown, z.output<typeof changePasswordSchema>>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const result = await changePasswordAction(form.getValues());
      if (result.ok) {
        toast.success(t("saved"));
        form.reset();
      } else {
        setFormError(applyActionError(result.error, form.setError, ["password", "confirmPassword"]));
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-md gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField label={t("current")} error={errors.currentPassword?.message}>
        <Input type="password" autoComplete="current-password" {...form.register("currentPassword")} />
      </FormField>
      <FormField label={t("new")} error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </FormField>
      <FormField label={t("confirm")} error={errors.confirmPassword?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
      </FormField>
      <div>
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
