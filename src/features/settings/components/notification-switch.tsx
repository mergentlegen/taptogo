"use client";

import { useId, useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { updateNotificationsAction } from "../actions";

/** One notification preference; flips instantly (optimistic) and rolls back on error. */
export function NotificationSwitch({
  name,
  checked,
  label,
  hint,
  savedMessage,
}: {
  name: "weeklyReportEmail" | "lowActivityAlert";
  checked: boolean;
  label: string;
  hint?: string;
  savedMessage: string;
}) {
  const id = useId();
  const [optimistic, setOptimistic] = useOptimistic(checked);
  const [, startTransition] = useTransition();

  return (
    <div className="flex items-start gap-3">
      <Switch
        id={id}
        checked={optimistic}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onCheckedChange={(value) =>
          startTransition(async () => {
            setOptimistic(value);
            const result = await updateNotificationsAction({ [name]: value });
            if (result.ok) toast.success(savedMessage);
            else toast.error(result.error.message);
          })
        }
      />
      <div className="grid gap-0.5">
        <Label htmlFor={id}>{label}</Label>
        {hint && (
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
