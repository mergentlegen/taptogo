import { FlaskConical } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getEnv } from "@/env";

/** Developer tools (/dev/*). Never available in production builds. */
export default async function DevLayout({ children }: { children: ReactNode }) {
  if (getEnv().isProduction) notFound();
  const t = await getTranslations("dev");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <p className="mb-6 inline-flex items-center gap-1.5 rounded-md bg-warning px-2 py-0.5 text-xs font-semibold text-warning-foreground">
        <FlaskConical className="size-3.5" aria-hidden="true" />
        {t("layoutBadge")}
      </p>
      {children}
    </div>
  );
}
