"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { syncAllAction, syncLocationAction } from "../actions";

export function SyncAllButton() {
  const t = useTranslations("adm.integrations");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await syncAllAction();
          if (result.ok) toast.success(t("syncAllDone", result.data));
          else toast.error(result.error.message);
        })
      }
    >
      <RefreshCw data-icon="inline-start" className={pending ? "animate-spin" : undefined} />
      {t("syncAll")}
    </Button>
  );
}

export function SyncButton({ locationId }: { locationId: string }) {
  const t = useTranslations("adm.integrations");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await syncLocationAction({ locationId });
          if (result.ok) toast.success(t("synced"));
          else toast.error(result.error.message);
        })
      }
    >
      <RefreshCw data-icon="inline-start" className={pending ? "animate-spin" : undefined} />
      {t("sync")}
    </Button>
  );
}
