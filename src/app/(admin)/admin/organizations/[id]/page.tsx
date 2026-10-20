import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata, Route } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AuditTable } from "@/features/admin/components/audit-table";
import { OrganizationBadge, SubscriptionBadge, YesNoBadge } from "@/features/admin/components/badges";
import {
  AddLocationDialog,
  ClientActions,
  InviteToClientDialog,
} from "@/features/admin/components/client-actions";
import { CardStatusBadge } from "@/features/cards/components/card-status-badge";
import { formatDateTime, formatIsoDate, formatKzt, formatNumber, formatRating } from "@/lib/format";
import { searchParam } from "@/lib/period";
import { cn } from "@/lib/utils";
import { requirePlatformAccess } from "@/server/auth/session";
import { can } from "@/server/permissions";
import { getServices } from "@/server/services";

const TABS = ["overview", "locations", "cards", "targets", "users", "payments", "tickets", "audit"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.organizations");
  return { title: t("title") };
}

function SimpleTable({ headers, rows, empty }: { headers: string[]; rows: ReactNode[][]; empty: string }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {row.map((cell, j) => (
                <TableCell key={j}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default async function AdminClientPage({
  params,
  searchParams,
}: PageProps<"/admin/organizations/[id]">) {
  const { actor } = await requirePlatformAccess("admin.access");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const detail = await getServices().admin.clients.detail(id);
  if (!detail) notFound();

  const t = await getTranslations();
  const requested = searchParam(query.tab);
  const tab: Tab = TABS.find((x) => x === requested) ?? "overview";
  const { organization: org, subscription } = detail;
  const empty = t("adm.clients.detail.noItems");
  const canManage = can(actor, "admin.manage");

  const content: Record<Tab, () => ReactNode> = {
    overview: () => (
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("adm.clients.detail.contacts")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            <p className="font-medium">{org.legalName ?? org.name}</p>
            {org.bin && (
              <p className="text-muted-foreground">{t("adm.clients.detail.bin", { bin: org.bin })}</p>
            )}
            <p>{org.contactName}</p>
            <p>{org.contactPhone}</p>
            <p>{org.contactEmail}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("adm.clients.detail.subscription")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {subscription ? (
              <>
                <p className="flex items-center gap-2">
                  {t(`subscription.plans.${subscription.plan}`)}
                  <SubscriptionBadge status={subscription.effectiveStatus} />
                </p>
                <p className="text-muted-foreground">
                  {t("adm.billing.paidUntil")}: {formatIsoDate(subscription.paidUntil, "long")}
                </p>
                <p className="text-muted-foreground">
                  {t("adm.billing.cardLimit")}: {detail.cards.filter((c) => c.status !== "REVOKED").length} /{" "}
                  {subscription.cardLimit}
                </p>
              </>
            ) : (
              "—"
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("adm.clients.detail.taps30")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{formatNumber(detail.taps30)}</p>
          </CardContent>
        </Card>
      </div>
    ),
    locations: () => (
      <div className="grid gap-3">
        {canManage && (
          <div>
            <AddLocationDialog organizationId={org.id} />
          </div>
        )}
        <SimpleTable
          empty={empty}
          headers={[
            t("adm.clients.wizard.locationName"),
            t("adm.clients.wizard.address"),
            t("adm.clients.detail.twogisColumn"),
            t("locations.columns.rating"),
          ]}
          rows={detail.locations.map((l) => [
            <span key="n" className="font-medium">
              {l.name}
            </span>,
            l.address,
            l.twogisProfileUrl ? (
              <a
                key="2gis"
                href={l.twogisProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                {l.twogisFirmId}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ) : (
              <YesNoBadge key="2gis" value={false} yes="" no={t("adm.clients.detail.notLinked")} />
            ),
            l.rating === null ? "—" : `${formatRating(l.rating)} · ${formatNumber(l.reviewCount ?? 0)}`,
          ])}
        />
      </div>
    ),
    cards: () => (
      <SimpleTable
        empty={empty}
        headers={[
          t("adm.cards.columns.code"),
          t("adm.cards.columns.label"),
          t("adm.cards.columns.location"),
          t("adm.cards.columns.status"),
          t("adm.clients.columns.taps30"),
        ]}
        rows={detail.cards.map((c) => [
          <Link key="c" href={`/admin/cards?search=${c.code}` as Route} className="font-mono hover:underline">
            {c.code}
          </Link>,
          c.label,
          c.locationName ?? "—",
          <CardStatusBadge key="s" status={c.status} />,
          <span key="t" className="tabular-nums">
            {formatNumber(c.taps30)}
          </span>,
        ])}
      />
    ),
    targets: () => (
      <SimpleTable
        empty={empty}
        headers={[
          t("adm.targets.columns.type"),
          t("adm.targets.columns.location"),
          t("adm.targets.columns.url"),
          t("adm.targets.columns.verified"),
        ]}
        rows={detail.targets.map((target) => [
          t(`cards.targetTypes.${target.type}`),
          target.locationName ?? "—",
          <span key="u" className="font-mono text-xs break-all">
            {target.url}
          </span>,
          <YesNoBadge
            key="v"
            value={target.isVerified}
            yes={t("adm.targets.verified")}
            no={t("adm.targets.notVerified")}
          />,
        ])}
      />
    ),
    users: () => (
      <div className="grid gap-4">
        {canManage && org.status !== "ARCHIVED" && (
          <div>
            <InviteToClientDialog organizationId={org.id} />
          </div>
        )}
        <SimpleTable
          empty={empty}
          headers={[t("team.columns.member"), t("team.columns.role"), t("team.columns.lastLogin")]}
          rows={detail.members.map((m) => [
            <span key="m">
              <span className="font-medium">{m.name}</span>
              <span className="block text-xs text-muted-foreground">{m.email}</span>
            </span>,
            t(`roles.${m.role}`),
            m.lastLoginAt ? formatDateTime(m.lastLoginAt) : t("team.never"),
          ])}
        />
        {detail.invitations.length > 0 && (
          <SimpleTable
            empty={empty}
            headers={[
              t("adm.clients.detail.pendingInvites"),
              t("team.columns.role"),
              t("team.expires", { date: "" }),
            ]}
            rows={detail.invitations.map((i) => [i.email, t(`roles.${i.role}`), formatDateTime(i.expiresAt)])}
          />
        )}
      </div>
    ),
    payments: () => (
      <SimpleTable
        empty={empty}
        headers={[
          t("adm.billing.columns.date"),
          t("adm.billing.columns.amount"),
          t("adm.billing.columns.method"),
          t("adm.billing.columns.comment"),
        ]}
        rows={detail.payments.map((p) => [
          formatDateTime(p.paidAt),
          <span key="a" className="tabular-nums">
            {formatKzt(p.amountKzt)}
          </span>,
          t(`adm.methods.${p.method}`),
          p.comment ?? "—",
        ])}
      />
    ),
    tickets: () => (
      <SimpleTable
        empty={empty}
        headers={[
          t("adm.inbox.columns.subject"),
          t("adm.inbox.columns.status"),
          t("adm.inbox.columns.created"),
        ]}
        rows={detail.tickets.map((ticket) => [
          <Link key="s" href={`/admin/support/${ticket.id}` as Route} className="font-medium hover:underline">
            {ticket.subject}
          </Link>,
          t(`support.statuses.${ticket.status}`),
          formatDateTime(ticket.createdAt),
        ])}
      />
    ),
    audit: () => (
      <AuditTable
        showClient={false}
        items={detail.audit.map((a) => ({ ...a, actor: null, organization: org.name }))}
      />
    ),
  };

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/admin/organizations">
          <ArrowLeft data-icon="inline-start" />
          {t("adm.clients.title")}
        </Link>
      </Button>
      <PageHeader
        title={org.name}
        description={org.legalName ?? undefined}
        actions={
          <ClientActions
            organization={org}
            canManage={canManage}
            canImpersonate={can(actor, "admin.impersonate")}
          />
        }
      />
      <div className="mb-4">
        <OrganizationBadge status={org.status} />
      </div>
      <nav aria-label={t("adm.clients.title")} className="mb-4 flex flex-wrap gap-1 border-b">
        {TABS.map((x) => (
          <Link
            key={x}
            href={`/admin/organizations/${org.id}?tab=${x}` as Route}
            scroll={false}
            aria-current={x === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground",
              x === tab && "border-primary font-medium text-foreground",
            )}
          >
            {t(`adm.clients.detail.tabs.${x}`)}
          </Link>
        ))}
      </nav>
      {content[tab]()}
    </>
  );
}
