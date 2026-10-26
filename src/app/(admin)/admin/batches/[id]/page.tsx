import { ArrowLeft, Download, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BatchActions, FlashRow } from "@/features/admin/components/batch-components";
import { requirePlatformAccess } from "@/server/auth/session";
import { can } from "@/server/permissions";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.batches");
  return { title: t("title") };
}

/** "Прошивка": the checklist used while writing NFC tags of a batch. */
export default async function BatchFlashPage({ params }: PageProps<"/admin/batches/[id]">) {
  const { actor } = await requirePlatformAccess("admin.access");
  const detail = await getServices().admin.cards.batchDetail((await params).id);
  if (!detail) notFound();
  const t = await getTranslations("adm");
  const { batch, cards } = detail;
  const nfc = cards.filter((c) => c.type !== "QR_ONLY");

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/admin/batches">
          <ArrowLeft data-icon="inline-start" />
          {t("batches.title")}
        </Link>
      </Button>
      <PageHeader
        title={t("flash.title", { batch: batch.name })}
        description={t("flash.progress", {
          written: nfc.filter((c) => c.nfcWritten).length,
          locked: nfc.filter((c) => c.nfcLocked).length,
          total: nfc.length,
        })}
        actions={
          <>
            {can(actor, "admin.manage") && (
              <BatchActions
                batch={{ id: batch.id, name: batch.name, notes: batch.notes }}
                redirectTo="/admin/batches"
              />
            )}
            <Button asChild>
              <a href={`/admin/batches/${batch.id}/export`} download>
                <Download data-icon="inline-start" />
                {t("batches.exportQr")}
              </a>
            </Button>
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ul className="divide-y rounded-xl border bg-card">
          {cards.map((card) => (
            <FlashRow key={card.id} card={card} canManage={can(actor, "admin.manage")} />
          ))}
        </ul>
        <Card className="h-fit xl:sticky xl:top-16">
          <CardHeader>
            <CardTitle className="text-base">{t("flash.instructionsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid list-decimal gap-2 pl-4 text-sm">
              <li>{t("flash.step1")}</li>
              <li>{t("flash.step2")}</li>
              <li>{t("flash.step3")}</li>
              <li className="font-medium">
                <TriangleAlert
                  className="mr-1 inline size-4 text-warning-foreground dark:text-warning"
                  aria-hidden="true"
                />
                {t("flash.step4")}
              </li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
