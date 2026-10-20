import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { ErrorScreen } from "@/components/errors/error-screen";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { homePathFor } from "@/features/auth/redirect";
import { getCurrentSession } from "@/server/auth/session";

/** Rendered with HTTP 403 when a guard calls forbidden(). */
export default async function Forbidden() {
  const t = await getTranslations("errors.forbidden");
  const session = await getCurrentSession();

  return (
    <ErrorScreen code={t("code")} title={t("title")} description={t("description")}>
      <Button asChild size="lg">
        <Link href={session ? homePathFor(session.user) : "/"}>{t("home")}</Link>
      </Button>
      {session && (
        <form action={signOutAction}>
          <Button type="submit" size="lg" variant="outline">
            {t("signInOther")}
          </Button>
        </form>
      )}
    </ErrorScreen>
  );
}
