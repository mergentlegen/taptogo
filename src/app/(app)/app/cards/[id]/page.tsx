import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata, Route } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardActions } from "@/features/cards/components/card-actions";
import { CardStatusBadge } from "@/features/cards/components/card-status-badge";
import { formatDateTime, formatNumber } from "@/lib/format";
import { requireOrgAccess } from "@/server/auth/session";
import { cardUrl, qrSvg } from "@/server/qr";
import { getServices } from "@/server/services";
import { orgContextFrom } from "@/server/services/context";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("app.pages.cards"))("title") };
}

export default async function CardPage({ params }: PageProps<"/app/cards/[id]">) {
  const access = await requireOrgAccess("org.view");
  const ctx = orgContextFrom(access);
  const services = getServices();
  const detail = await services.cards.detail(ctx, (await params).id);
  if (!detail) notFound();
  const subscription = await services.subscription.view(ctx);
  const t = await getTranslations("cards");
  const { card, stats } = detail;
  const location = detail.options.locations.find((l) => l.id === card.locationId);
  const qr = await qrSvg(cardUrl(card.code, "qr"));
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/app/cards">
          <ArrowLeft />
          {t("detail.back")}
        </Link>
      </Button>
      <PageHeader title={card.label} description={detail.locationName ?? t("noVenue")} />
      <div className="mb-6">
        <CardStatusBadge customer status={card.status} />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("detail.target")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <p className="font-medium">{detail.locationName ?? t("noVenue")}</p>
                {location && <p className="text-sm text-muted-foreground">{location.address}</p>}
              </div>
              <p className="text-sm text-muted-foreground">{t("venueHint")}</p>
              {detail.target && (
                <Button asChild variant="outline" className="w-fit">
                  <a href={cardUrl(card.code, "nfc")} target="_blank" rel="noopener noreferrer">
                    <ExternalLink />
                    {t("checkLink")}
                  </a>
                </Button>
              )}
              {access.permissions.includes("org.cards.manage") ? (
                <CardActions detail={detail} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("actions.readOnly")}</p>
              )}
            </CardContent>
          </Card>
          {subscription.statsAllowed && (
            <dl className="grid grid-cols-1 gap-5 border-y py-5 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted-foreground">{t("detail.taps")}</dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(stats.taps)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t("columns.lastTap")}</dt>
                <dd className="mt-1 font-medium">
                  {stats.lastTapAt ? formatDateTime(stats.lastTapAt, ctx.timeZone) : t("never")}
                </dd>
              </div>
            </dl>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer py-2 text-muted-foreground">Номер карты для поддержки</summary>
            <p className="py-2 font-mono">{card.code}</p>
          </details>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.qrTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-sm text-muted-foreground">{t("detail.qrHint")}</p>
            <div
              role="img"
              aria-label={t("detail.qrTitle")}
              className="mx-auto w-44 bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <Button asChild variant="outline">
              <a href={`/app/cards/${card.id}/qr?format=png` as Route} download>
                {t("detail.downloadPng")}
              </a>
            </Button>
            <details className="text-sm">
              <summary className="cursor-pointer py-2 text-muted-foreground">Для печати</summary>
              <a
                href={`/app/cards/${card.id}/qr?format=svg` as Route}
                download
                className="text-primary underline"
              >
                {t("detail.downloadSvg")}
              </a>
            </details>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
