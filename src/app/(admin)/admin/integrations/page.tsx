import { Info, PlugZap } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { features } from "@/config/features";
import { YesNoBadge } from "@/features/admin/components/badges";
import { SyncAllButton, SyncButton } from "@/features/admin/components/integration-components";
import { formatDateTime, formatNumber, formatRating } from "@/lib/format";
import { requirePlatformAccess } from "@/server/auth/session";
import { can } from "@/server/permissions";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.integrations");
  return { title: t("title") };
}

export default async function AdminIntegrationsPage() {
  const { actor } = await requirePlatformAccess("admin.access");
  if (!features.twogisApi) notFound();
  const [status, t] = await Promise.all([
    getServices().admin.integrations.status(),
    getTranslations("adm.integrations"),
  ]);
  const canManage = can(actor, "admin.manage");

  return (
    <>
      <PageHeader title={t("title")} actions={canManage && <SyncAllButton />} />
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-center gap-3">
          <PlugZap className="size-5 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">{t("status")}:</span>
          <YesNoBadge value={status.connected} yes={t("connected")} no={t("notConnected")} />
          <span className="text-sm text-muted-foreground">{t("provider", { name: status.provider })}</span>
          <p className="flex w-full items-start gap-2 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("hint")}
          </p>
        </CardContent>
      </Card>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.location")}</TableHead>
              <TableHead>{t("columns.client")}</TableHead>
              <TableHead>{t("columns.firm")}</TableHead>
              <TableHead>{t("columns.lastSync")}</TableHead>
              <TableHead className="text-right">{t("columns.rating")}</TableHead>
              <TableHead className="text-right">{t("columns.reviews")}</TableHead>
              {canManage && (
                <TableHead>
                  <span className="sr-only">{t("sync")}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {status.locations.map((row) => (
              <TableRow key={row.locationId}>
                <TableCell className="font-medium">{row.location}</TableCell>
                <TableCell>{row.organization}</TableCell>
                <TableCell className="font-mono text-xs">{row.firmId ?? t("notLinked")}</TableCell>
                <TableCell className="tabular-nums">
                  {row.lastSnapshot ? formatDateTime(row.lastSnapshot.capturedAt) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.lastSnapshot?.rating === null || row.lastSnapshot?.rating === undefined
                    ? "—"
                    : formatRating(row.lastSnapshot.rating)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.lastSnapshot?.reviewCount === null || row.lastSnapshot?.reviewCount === undefined
                    ? "—"
                    : formatNumber(row.lastSnapshot.reviewCount)}
                </TableCell>
                {canManage && (
                  <TableCell>{row.firmId && <SyncButton locationId={row.locationId} />}</TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
