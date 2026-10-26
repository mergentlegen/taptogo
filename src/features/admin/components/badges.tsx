import { useTranslations } from "next-intl";

import type { OrganizationStatus } from "@/features/organizations/schemas";
import { cn } from "@/lib/utils";

const tone = {
  good: "bg-success/12 text-success border-success/30",
  warn: "bg-warning/20 text-warning-foreground border-warning/50 dark:text-warning",
  bad: "bg-destructive/10 text-destructive border-destructive/30",
  muted: "bg-muted text-muted-foreground border-border",
} as const;

function Pill({ children, variant }: { children: React.ReactNode; variant: keyof typeof tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone[variant],
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const orgTone: Record<OrganizationStatus, keyof typeof tone> = {
  ACTIVE: "good",
  SUSPENDED: "warn",
  ARCHIVED: "muted",
};

export function OrganizationBadge({ status }: { status: OrganizationStatus }) {
  const t = useTranslations("adm.orgStatuses");
  return <Pill variant={orgTone[status]}>{t(status)}</Pill>;
}

export function YesNoBadge({ value, yes, no }: { value: boolean; yes: string; no: string }) {
  return <Pill variant={value ? "good" : "muted"}>{value ? yes : no}</Pill>;
}
