import { Download, Nfc } from "lucide-react";
import type { Metadata, Route } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateBatchDialog } from "@/features/admin/components/batch-components";
import { formatDate } from "@/lib/format";
import { requirePlatformAccess } from "@/server/auth/session";
import { can } from "@/server/permissions";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.batches");
  return { title: t("title") };
}

export default async function AdminBatchesPage() {
  const { actor } = await requirePlatformAccess("admin.access");
  const [batches, t] = await Promise.all([getServices().admin.cards.listBatches(), getTranslations()]);

  return (
    <>
      <PageHeader
        title={t("admin.pages.batches.title")}
        description={t("admin.pages.batches.description")}
        actions={can(actor, "admin.manage") && <CreateBatchDialog />}
      />
      {batches.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">{t("adm.batches.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("adm.batches.columns.name")}</TableHead>
                <TableHead>{t("adm.batches.columns.type")}</TableHead>
                <TableHead className="text-right">{t("adm.batches.columns.quantity")}</TableHead>
                <TableHead className="text-right">{t("adm.batches.columns.assigned")}</TableHead>
                <TableHead className="text-right">{t("adm.batches.columns.written")}</TableHead>
                <TableHead>{t("adm.batches.columns.createdAt")}</TableHead>
                <TableHead>
                  <span className="sr-only">{t("adm.common.actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <span className="font-medium">{b.name}</span>
                    {b.notes && <span className="block text-xs text-muted-foreground">{b.notes}</span>}
                  </TableCell>
                  <TableCell>{t(`cards.types.${b.cardType}`)}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.assigned}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.written}</TableCell>
                  <TableCell>{formatDate(b.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/admin/batches/${b.id}` as Route}>
                          <Nfc data-icon="inline-start" />
                          {t("adm.batches.flash")}
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <a href={`/admin/batches/${b.id}/export?format=csv`} download>
                          <Download data-icon="inline-start" />
                          CSV
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="ghost">
                        <a href={`/admin/batches/${b.id}/export?format=zip`} download>
                          <Download data-icon="inline-start" />
                          ZIP
                        </a>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
