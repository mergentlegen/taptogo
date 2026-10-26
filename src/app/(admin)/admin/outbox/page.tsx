import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { OutboxList } from "@/features/admin/components/outbox-list";
import { requirePlatformAccess } from "@/server/auth/session";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.outbox");
  return { title: t("title") };
}

/** Administrators only: the messages carry one-time links that let someone into an account. */
export default async function AdminOutboxPage() {
  const { session } = await requirePlatformAccess("admin.manage");
  const role = session.user.platformRole;
  if (!role) throw new Error("unreachable: admin.manage without a platform role");
  const [messages, t] = await Promise.all([
    getServices().admin.outbox.list({ userId: session.user.id, role, sessionId: session.id }),
    getTranslations("admin.pages.outbox"),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <OutboxList messages={messages} />
    </>
  );
}
