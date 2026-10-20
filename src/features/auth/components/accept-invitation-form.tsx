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

import { acceptInvitationAction, acceptInvitationExistingAction } from "../actions";
import { acceptInvitationSchema } from "../schemas";

type Values = z.input<typeof acceptInvitationSchema>;

/** New users choose a name and password; existing users just confirm. */
export function AcceptInvitationForm({ token, existingUser }: { token: string; existingUser: boolean }) {
  const t = useTranslations("auth");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values, unknown, z.output<typeof acceptInvitationSchema>>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: { token, name: "", password: "", confirmPassword: "" },
  });
  const { errors } = form.formState;

  if (existingUser) {
    return (
      <div className="grid gap-4">
        {formError && <FormAlert>{formError}</FormAlert>}
        <Button
          size="lg"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await acceptInvitationExistingAction({ token });
              if (!result.ok) setFormError(result.error.message);
            })
          }
        >
          {t("invite.submit")}
        </Button>
      </div>
    );
  }

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      setFormError(null);
      const result = await acceptInvitationAction(values);
      if (!result.ok) {
        setFormError(applyActionError(result.error, form.setError, ["name", "password", "confirmPassword"]));
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField label={t("fields.name")} error={errors.name?.message}>
        <Input autoComplete="name" autoFocus {...form.register("name")} />
      </FormField>
      <FormField label={t("fields.password")} error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("password")} />
      </FormField>
      <FormField label={t("fields.confirmPassword")} error={errors.confirmPassword?.message}>
        <Input type="password" autoComplete="new-password" {...form.register("confirmPassword")} />
      </FormField>
      <Button type="submit" size="lg" disabled={pending}>
        {t("invite.submit")}
      </Button>
    </form>
  );
}
