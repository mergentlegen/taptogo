"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { applyActionError } from "@/lib/forms";

import { createEmployeeAction, updateEmployeeAction } from "../actions";
import { employeeFormSchema } from "../form-schemas";

type Values = z.input<typeof employeeFormSchema>;
const NONE = "none";

export type EditableEmployee = {
  id: string;
  name: string;
  position: string | null;
  locationId: string | null;
  isActive: boolean;
};

/** Create (no `employee`) or edit an employee. */
export function EmployeeDialog({
  employee,
  locations,
  trigger,
}: {
  employee?: EditableEmployee;
  locations: { id: string; name: string }[];
  trigger: ReactNode;
}) {
  const t = useTranslations("employees");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values, unknown, z.output<typeof employeeFormSchema>>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: {
      name: employee?.name ?? "",
      position: employee?.position ?? "",
      locationId: employee?.locationId ?? "",
      isActive: employee?.isActive ?? true,
    },
  });

  // Validated on the client, then the raw values go to the server, which validates them again.
  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setFormError(null);
      const values = form.getValues();
      const result = employee
        ? await updateEmployeeAction({ ...values, employeeId: employee.id })
        : await createEmployeeAction(values);
      if (result.ok) {
        toast.success(t("saved"));
        setOpen(false);
        if (!employee) form.reset();
      } else {
        setFormError(applyActionError(result.error, form.setError, ["name", "position"]));
      }
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{employee ? t("form.editTitle") : t("form.createTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          {formError && <FormAlert>{formError}</FormAlert>}
          <FormField label={t("form.name")} error={form.formState.errors.name?.message}>
            <Input autoComplete="off" {...form.register("name")} />
          </FormField>
          <FormField label={t("form.position")} error={form.formState.errors.position?.message}>
            <Input autoComplete="off" {...form.register("position")} />
          </FormField>
          <Controller
            control={form.control}
            name="locationId"
            render={({ field }) => (
              <FormField label={t("form.location")}>
                <Select
                  value={field.value || NONE}
                  onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("form.noLocation")}</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          />
          <Controller
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <div className="flex items-center gap-3">
                <Switch id="employee-active" checked={field.value} onCheckedChange={field.onChange} />
                <Label htmlFor="employee-active">{t("form.isActive")}</Label>
              </div>
            )}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("form.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("form.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
