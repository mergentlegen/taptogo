import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

import type { CardStatus } from "../schemas";

const styles: Record<CardStatus, string> = {
  ACTIVE: "bg-success/12 text-success border-success/30",
  PAUSED: "bg-warning/20 text-warning-foreground border-warning/50 dark:text-warning",
  LOST: "bg-destructive/10 text-destructive border-destructive/30",
  REVOKED: "bg-destructive/10 text-destructive border-destructive/30",
  UNASSIGNED: "bg-muted text-muted-foreground border-border",
};

/** Status always carries its text label; color only reinforces it. */
export function CardStatusBadge({ status }: { status: CardStatus }) {
  const t = useTranslations("cards.statuses");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        styles[status],
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {t(status)}
    </span>
  );
}
