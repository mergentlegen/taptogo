import type { Metadata, Route } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ticketStatuses } from "@/features/support/schemas";
import { formatDateTime } from "@/lib/format";
import { searchParam } from "@/lib/period";
import { cn } from "@/lib/utils";
import { requirePlatformAccess } from "@/server/auth/session";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.support");
  return { title: t("title") };
}

export default async function AdminSupportPage({ searchParams }: PageProps<"/admin/support">) {
  await requirePlatformAccess("admin.access");
  const requested = searchParam((await searchParams).status);
  const status = ticketStatuses.find((s) => s === requested);
  const [tickets, t] = await Promise.all([
    getServices().admin.inbox.tickets(status ? [status] : undefined),
    getTranslations(),
  ]);

  return (
    <>
      <PageHeader title={t("admin.pages.support.title")} description={t("admin.pages.support.description")} />
      <nav className="mb-3 flex flex-wrap gap-1" aria-label={t("adm.inbox.status")}>
        {[undefined, ...ticketStatuses].map((s) => (
          <Link
            key={s ?? "all"}
            href={(s ? `/admin/support?status=${s}` : "/admin/support") as Route}
            aria-current={s === status ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted",
              s === status && "bg-muted font-medium text-foreground",
            )}
          >
            {s ? t(`support.statuses.${s}`) : t("adm.inbox.allStatuses")}
          </Link>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("adm.inbox.columns.subject")}</TableHead>
              <TableHead>{t("adm.inbox.columns.client")}</TableHead>
              <TableHead>{t("adm.inbox.columns.status")}</TableHead>
              <TableHead>{t("adm.inbox.columns.assignee")}</TableHead>
              <TableHead>{t("adm.inbox.columns.created")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {t("adm.inbox.empty")}
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell>
                    <Link
                      href={`/admin/support/${ticket.id}` as Route}
                      className="font-medium hover:underline"
                    >
                      {ticket.subject}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{ticket.author}</span>
                  </TableCell>
                  <TableCell>{ticket.organization}</TableCell>
                  <TableCell>
                    <Badge variant={ticket.status === "NEW" ? "default" : "secondary"}>
                      {t(`support.statuses.${ticket.status}`)}
                    </Badge>
                  </TableCell>
                  <TableCell>{ticket.assignee ?? t("adm.inbox.unassigned")}</TableCell>
                  <TableCell className="tabular-nums">{formatDateTime(ticket.createdAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
