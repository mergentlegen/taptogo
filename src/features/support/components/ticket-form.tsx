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
import { Textarea } from "@/components/ui/textarea";
import { applyActionError } from "@/lib/forms";

import { createTicketAction } from "../actions";
import { ticketSchema } from "../form-schemas";

export function TicketForm() {
  const t = useTranslations("support");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof ticketSchema>, unknown, z.output<typeof ticketSchema>>({
    resolver: zodResolver(ticketSchema),
    defaultValues: { subject: "", body: "" },
  });

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const result = await createTicketAction(form.getValues());
      if (result.ok) {
        toast.success(t("sent"));
        form.reset();
      } else {
        setFormError(applyActionError(result.error, form.setError, ["subject", "body"]));
      }
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {formError && <FormAlert>{formError}</FormAlert>}
      <FormField label={t("subject")} error={form.formState.errors.subject?.message}>
        <Input maxLength={200} {...form.register("subject")} />
      </FormField>
      <FormField label={t("body")} error={form.formState.errors.body?.message}>
        <Textarea rows={5} maxLength={5000} {...form.register("body")} />
      </FormField>
      <div>
        <Button type="submit" disabled={pending}>
          {t("send")}
        </Button>
      </div>
    </form>
  );
}
