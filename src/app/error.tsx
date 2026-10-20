"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect } from "react";

import { ErrorScreen } from "@/components/errors/error-screen";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const t = useTranslations("errors.server");

  useEffect(() => {
    // Production errors reach the client without message or stack; the digest
    // links this screen to the server log entry.
    console.error(error);
  }, [error]);

  return (
    <ErrorScreen code={t("code")} title={t("title")} description={t("description")}>
      <Button size="lg" onClick={() => retry()}>
        {t("retry")}
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/">{t("home")}</Link>
      </Button>
      {error.digest && (
        <p className="w-full font-mono text-xs text-muted-foreground">
          {t("reference", { digest: error.digest })}
        </p>
      )}
    </ErrorScreen>
  );
}
