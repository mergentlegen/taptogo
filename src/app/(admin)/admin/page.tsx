import type { Metadata, Route } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

import { StatCard } from "@/components/data/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubscriptionBadge } from "@/features/admin/components/badges";
import { formatDateTime, formatIsoDate, formatKzt, formatNumber } from "@/lib/format";
import { requirePlatformAccess } from "@/server/auth/session";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.overview");
  return { title: t("title") };
}

function ListCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  );
}

export default async function AdminOverviewPage() {
  await requirePlatformAccess("admin.access");
  const [data, t] = await Promise.all([getServices().admin.overview.overview(), getTranslations()]);
  const nothing = <p className="text-muted-foreground">{t("adm.overview.nothing")}</p>;
  const org = (id: string, name: string) => (
    <Link href={`/admin/organizations/${id}` as Route} className="font-medium hover:underline">
      {name}
    </Link>
  );

  return (
    <>
      <PageHeader
        title={t("admin.pages.overview.title")}
        description={t("admin.pages.overview.description")}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={t("adm.overview.activeClients")} value={formatNumber(data.activeClients)} />
        <StatCard label={t("adm.overview.activeCards")} value={formatNumber(data.activeCards)} />
        <StatCard label={t("adm.overview.tapsToday")} value={formatNumber(data.tapsToday)} />
        <StatCard label={t("adm.overview.taps7d")} value={formatNumber(data.taps7d)} />
        <StatCard label={t("adm.overview.revenue")} value={formatKzt(data.revenueMonthKzt)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title={t("adm.overview.expiring")}>
          {data.expiring.length === 0
            ? nothing
            : data.expiring.map((row) => (
                <p key={row.organizationId} className="flex justify-between gap-2 py-1">
                  {org(row.organizationId, row.name)}
                  <span className="text-muted-foreground">
                    {formatIsoDate(row.paidUntil)} · {t("adm.overview.daysLeft", { days: row.daysLeft })}
                  </span>
                </p>
              ))}
        </ListCard>
        <ListCard title={t("adm.overview.lapsed")}>
          {data.lapsed.length === 0
            ? nothing
            : data.lapsed.map((row) => (
                <p key={row.organizationId} className="flex items-center justify-between gap-2 py-1">
                  {org(row.organizationId, row.name)}
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {formatIsoDate(row.paidUntil)}
                    <SubscriptionBadge status={row.status} />
                  </span>
                </p>
              ))}
        </ListCard>
        <ListCard title={t("adm.overview.idleCards")} description={t("adm.overview.idleHint")}>
          {data.idleCards.length === 0
            ? nothing
            : data.idleCards.map((card) => (
                <p key={card.cardId} className="flex justify-between gap-2 py-1">
                  <span>
                    {org(card.organizationId, card.organization)} · {card.label}{" "}
                    <span className="font-mono text-xs text-muted-foreground">{card.code}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {card.lastTapAt
                      ? t("adm.overview.lastTap", { date: formatDateTime(card.lastTapAt) })
                      : t("adm.overview.neverTapped")}
                  </span>
                </p>
              ))}
        </ListCard>
        <div className="grid gap-4">
          <ListCard title={t("adm.overview.newLeads")}>
            {data.newLeads.length === 0
              ? nothing
              : data.newLeads.map((lead) => (
                  <p key={lead.id} className="flex justify-between gap-2 py-1">
                    <Link href="/admin/leads" className="font-medium hover:underline">
                      {lead.businessName}
                    </Link>
                    <span className="text-muted-foreground">{formatDateTime(lead.createdAt)}</span>
                  </p>
                ))}
          </ListCard>
          <ListCard title={t("adm.overview.newTickets")}>
            {data.newTickets.length === 0
              ? nothing
              : data.newTickets.map((ticket) => (
                  <p key={ticket.id} className="flex justify-between gap-2 py-1">
                    <Link
                      href={`/admin/support/${ticket.id}` as Route}
                      className="font-medium hover:underline"
                    >
                      {ticket.subject}
                    </Link>
                    <span className="text-muted-foreground">{ticket.organization}</span>
                  </p>
                ))}
          </ListCard>
        </div>
      </div>
    </>
  );
}
