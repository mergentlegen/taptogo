import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { FormAlert } from "@/components/forms/form-alert";
import { AuthCard } from "@/components/layout/auth-card";
import { DemoLogin } from "@/features/auth/components/demo-login";
import { LoginForm } from "@/features/auth/components/login-form";
import { homePathFor, safeNextPath } from "@/features/auth/redirect";
import { getCurrentSession } from "@/server/auth/session";
import { getContainer } from "@/server/container";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

const param = (value: string | string[] | undefined) => (typeof value === "string" ? value : undefined);

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(param(params.next)) ?? undefined;

  const session = await getCurrentSession();
  if (session) redirect(next ?? homePathFor(session.user));

  const t = await getTranslations("auth.login");
  const { demo } = getContainer();
  const showDemo = process.env.NODE_ENV !== "production" && demo !== null;
  const notice = params.reset
    ? t("resetDone")
    : params.invited
      ? t("invited")
      : params.signedOut
        ? t("signedOut")
        : null;

  return (
    <AuthCard
      title={t("title")}
      description={t("description")}
      footer={showDemo && <DemoLogin accounts={demo.accounts} password={demo.password} next={next} />}
    >
      <div className="grid gap-4">
        {notice && <FormAlert variant="success">{notice}</FormAlert>}
        <LoginForm next={next} />
      </div>
    </AuthCard>
  );
}
