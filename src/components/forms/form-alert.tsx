import { CircleAlert, CircleCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/** Message above a form. Announced to screen readers when it appears. */
export function FormAlert({
  children,
  variant = "error",
}: {
  children: React.ReactNode;
  variant?: "error" | "success" | "info";
}) {
  const Icon = variant === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
        variant === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
        variant === "success" && "border-success/30 bg-success/10 text-foreground",
        variant === "info" && "bg-muted text-foreground",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
