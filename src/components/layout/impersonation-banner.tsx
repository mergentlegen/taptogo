import { Eye, LogOut } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { stopImpersonationAction } from "@/features/admin/actions";

/** Always visible while staff view a client cabinet, so nobody forgets whose data this is. */
export async function ImpersonationBanner({
  organization,
  admin,
  expiresAt,
  timeZone,
}: {
  organization: string;
  admin: string;
  expiresAt: string;
  timeZone: string;
}) {
  const t = await getTranslations("impersonation");
  const time = new Intl.DateTimeFormat("ru-RU", { timeStyle: "short", timeZone }).format(new Date(expiresAt));

  return (
    <div
      role="status"
      data-testid="impersonation-banner"
      className="sticky top-0 z-40 flex flex-wrap items-center gap-3 bg-warning px-4 py-2 text-sm text-warning-foreground md:px-8"
    >
      <Eye className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 font-medium">{t("banner", { organization, admin, time })}</span>
      <form action={stopImpersonationAction}>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="border-warning-foreground/30 bg-transparent"
        >
          <LogOut data-icon="inline-start" />
          {t("exit")}
        </Button>
      </form>
    </div>
  );
}
