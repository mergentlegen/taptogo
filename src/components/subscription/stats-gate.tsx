import { Clock, Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { formatIsoDate } from "@/lib/format";
import type { SubscriptionView } from "@/server/services/subscription-service";

import { ContactDialog } from "./contact-dialog";

/**
 * Renders statistics only while the subscription allows it. When it has
 * expired the real numbers are not even sent to the browser — the blurred
 * area is placeholder shapes, not the data behind a CSS filter.
 */
export async function StatsGate({
  subscription,
  children,
}: {
  subscription: SubscriptionView;
  children: ReactNode;
}) {
  const t = await getTranslations("subscription");

  if (!subscription.statsAllowed) {
    return (
      <div className="relative" data-testid="stats-locked">
        <div aria-hidden="true" className="pointer-events-none grid gap-4 blur-sm select-none">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
        <div className="absolute inset-0 flex items-start justify-center pt-12">
          <div
            role="alert"
            className="mx-4 grid max-w-md gap-3 rounded-2xl border bg-card p-6 text-center shadow-lg"
          >
            <Lock className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-lg font-semibold">{t("expiredTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("expiredText")}</p>
            <div>
              <ContactDialog triggerLabel={t("contact")} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {subscription.status === "GRACE" && subscription.paidUntil && (
        <div
          role="status"
          className="mb-4 flex flex-col gap-3 rounded-xl border border-warning/50 bg-warning/15 p-4 sm:flex-row sm:items-center"
        >
          <Clock className="size-5 shrink-0" aria-hidden="true" />
          <div className="flex-1 text-sm">
            <p className="font-medium">
              {t("graceTitle", { date: formatIsoDate(subscription.paidUntil, "long") })}
            </p>
            <p className="text-muted-foreground">{t("graceText")}</p>
          </div>
          <ContactDialog triggerLabel={t("contact")} variant="outline" />
        </div>
      )}
      {children}
    </>
  );
}
