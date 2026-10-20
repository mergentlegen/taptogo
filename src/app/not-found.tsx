import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { ErrorScreen } from "@/components/errors/error-screen";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("errors.notFound");

  return (
    <ErrorScreen code={t("code")} title={t("title")} description={t("description")}>
      <Button asChild size="lg">
        <Link href="/">{t("home")}</Link>
      </Button>
    </ErrorScreen>
  );
}
