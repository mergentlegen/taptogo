import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { StaffManager } from "@/features/admin/components/staff-manager";
import { requirePlatformAccess } from "@/server/auth/session";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.staff");
  return { title: t("title") };
}

/** SUPER_ADMIN only — enforced here and again in every staff action. */
export default async function AdminStaffPage() {
  const { session } = await requirePlatformAccess("admin.staff.manage");
  const [staff, t] = await Promise.all([
    getServices().admin.staff.list(),
    getTranslations("admin.pages.staff"),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <StaffManager staff={staff} currentUserId={session.user.id} />
    </>
  );
}
