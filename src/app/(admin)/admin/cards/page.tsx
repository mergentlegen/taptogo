import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { CardsManager, type CardsQuery } from "@/features/admin/components/cards-manager";
import { cardStatusSchema } from "@/features/cards/schemas";
import { searchParam } from "@/lib/period";
import { idSchema } from "@/lib/schemas";
import { requirePlatformAccess } from "@/server/auth/session";
import { can } from "@/server/permissions";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.cards");
  return { title: t("title") };
}

export default async function AdminCardsPage({ searchParams }: PageProps<"/admin/cards">) {
  const { actor } = await requirePlatformAccess("admin.access");
  const params = await searchParams;
  // Unknown or malformed filters are dropped, never passed to storage.
  const query: CardsQuery = {
    search: searchParam(params.search)?.trim().slice(0, 40) ?? "",
    status: cardStatusSchema.safeParse(searchParam(params.status)).data ?? null,
    batchId: idSchema.safeParse(searchParam(params.batch)).data ?? null,
  };
  const admin = getServices().admin;
  const [found, assignment, batches, t] = await Promise.all([
    admin.cards.search({
      search: query.search || undefined,
      status: query.status ?? undefined,
      batchId: query.batchId ?? undefined,
    }),
    admin.clients.assignmentOptions(),
    admin.cards.listBatches(),
    getTranslations("admin.pages.cards"),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <CardsManager
        key={`${query.search}|${query.status}|${query.batchId}`}
        cards={found.items}
        total={found.total}
        query={query}
        batches={batches.map(({ id, name, quantity }) => ({ id, name, quantity }))}
        organizations={assignment}
        canManage={can(actor, "admin.manage")}
        canChangeStatus={can(actor, "admin.cards.status")}
      />
    </>
  );
}
