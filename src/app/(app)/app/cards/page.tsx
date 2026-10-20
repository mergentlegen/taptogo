import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { CardsTable } from "@/features/cards/components/cards-table";
import { requireOrgAccess } from "@/server/auth/session";
import { getServices } from "@/server/services";
import { orgContextFrom } from "@/server/services/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.pages.cards");
  return { title: t("title") };
}

export default async function CardsPage() {
  const access = await requireOrgAccess("org.view");
  const ctx = orgContextFrom(access);
  const t = await getTranslations("app.pages.cards");
  const [cards, locations] = await Promise.all([
    getServices().cards.list(ctx),
    getServices().locations.options(ctx),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <CardsTable cards={cards} locations={locations} timeZone={ctx.timeZone} />
    </>
  );
}
