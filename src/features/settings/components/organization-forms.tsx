"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ImageUp, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { applyActionError } from "@/lib/forms";

import { removeLogoAction, updateOrganizationAction, uploadLogoAction } from "../actions";
import { LOGO_MAX_BYTES, organizationSchema } from "../form-schemas";

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

/** Client checks size early for a quick message; the server re-checks size and the real file type. */
export function LogoUpload({ logoUrl, readOnly }: { logoUrl: string | null; readOnly: boolean }) {
  const t = useTranslations("settings.organization");
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const upload = (file: File) => {
    setError(null);
    if (file.size > LOGO_MAX_BYTES) {
      setError(t("logoHint"));
      return;
    }
    const data = new FormData();
    data.set("logo", file);
    startTransition(async () => {
      const result = await uploadLogoAction(data);
      if (result.ok) toast.success(t("logoSaved"));
      else setError(result.error.message);
      if (input.current) input.current.value = "";
    });
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-4">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded-xl border bg-muted">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed data/storage URL, not a static asset
            <img src={logoUrl} alt={t("logo")} className="size-full object-contain" />
          ) : (
            <span className="px-2 text-center text-xs text-muted-foreground">{t("noLogo")}</span>
          )}
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              id="logo-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
              }}
            />
            <Button variant="outline" disabled={pending} onClick={() => input.current?.click()}>
              <ImageUp data-icon="inline-start" />
              {pending ? t("uploading") : t("upload")}
            </Button>
            {logoUrl && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await removeLogoAction();
                    if (result.ok) toast.success(t("logoRemoved"));
                    else setError(result.error.message);
                  })
                }
              >
                <Trash2 data-icon="inline-start" />
                {t("remove")}
              </Button>
            )}
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("logoHint")}</p>
      {error && <FormAlert>{error}</FormAlert>}
    </div>
  );
}
