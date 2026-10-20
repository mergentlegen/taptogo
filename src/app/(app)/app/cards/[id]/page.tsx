import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import type { Metadata, Route } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Heatmap } from "@/components/charts/heatmap";
import { ShareBar } from "@/components/charts/share-bar";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { StatCard } from "@/components/data/stat-card";
import { PageHeader } from "@/components/layout/page-header";
import { StatsGate } from "@/components/subscription/stats-gate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardActions } from "@/features/cards/components/card-actions";
import { CardStatusBadge } from "@/features/cards/components/card-status-badge";
import { formatDateTime, formatNumber } from "@/lib/format";
import { requireOrgAccess } from "@/server/auth/session";
import { cardUrl, qrSvg } from "@/server/qr";
import { getServices } from "@/server/services";
import { orgContextFrom } from "@/server/services/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.pages.cards");
  return { title: t("title") };
}

export default async function CardPage({ params }: PageProps<"/app/cards/[id]">) {
  const access = await requireOrgAccess("org.view");
  const ctx = orgContextFrom(access);
  const { id } = await params;
  const services = getServices();
  // Scoped to the session's organization: another organization's card is simply "not found".
  const detail = await services.cards.detail(ctx, id);
  if (!detail) notFound();

  const t = await getTranslations("cards");
  const tc = await getTranslations("dashboard.charts");
  const subscription = await services.subscription.view(ctx);
  const { card, stats } = detail;
  const canManage = access.permissions.includes("org.cards.manage");
  const qr = await qrSvg(cardUrl(card.code, "qr"));

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/app/cards">
          <ArrowLeft data-icon="inline-start" />
          {t("detail.back")}
        </Link>
      </Button>
      <PageHeader
        title={card.label}
        description={[detail.locationName, detail.employeeName, t(`types.${card.type}`)]
          .filter(Boolean)
          .join(" · ")}
        actions={canManage ? <CardActions detail={detail} /> : undefined}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <CardStatusBadge status={card.status} />
        <span className="font-mono text-muted-foreground">{card.code}</span>
        {!canManage && <span className="text-muted-foreground">{t("actions.readOnly")}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-4">
          <StatsGate subscription={subscription}>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard label={t("detail.taps")} value={formatNumber(stats.taps)} />
                <StatCard label={t("detail.unique")} value={formatNumber(stats.uniqueVisitors)} />
                <StatCard
                  label={t("detail.lastTap")}
                  value={stats.lastTapAt ? formatDateTime(stats.lastTapAt, ctx.timeZone) : t("never")}
                />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>{tc("tapsTitle")}</CardTitle>
                  <CardDescription>{t("detail.stats30")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <TimeSeriesChart
                    kind="bar"
                    label={tc("taps")}
                    color="var(--chart-1)"
                    valueFormat="number"
                    data={stats.daily.map((d) => ({ date: d.date, value: d.taps }))}
                    ariaLabel={`${tc("tapsTitle")}: ${formatNumber(stats.taps)}`}
                  />
                </CardContent>
              </Card>
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>{tc("heatmapTitle")}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Heatmap cells={stats.heatmap} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>{t("detail.devices")}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-6">
                    <ShareBar
                      ariaLabel={tc("sources")}
                      segments={[
                        {
                          key: "nfc",
                          label: tc("NFC"),
                          value: stats.breakdown.sources.NFC,
                          color: "var(--chart-1)",
                        },
                        {
                          key: "qr",
                          label: tc("QR"),
                          value: stats.breakdown.sources.QR,
                          color: "var(--chart-2)",
                        },
                      ]}
                    />
                    <ShareBar
                      ariaLabel={tc("platforms")}
                      segments={[
                        {
                          key: "ios",
                          label: tc("IOS"),
                          value: stats.breakdown.operatingSystems.IOS,
                          color: "var(--chart-1)",
                        },
                        {
                          key: "android",
                          label: tc("ANDROID"),
                          value: stats.breakdown.operatingSystems.ANDROID,
                          color: "var(--chart-2)",
                        },
                      ]}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </StatsGate>
        </div>

        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("detail.settings")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">{t("detail.target")}</p>
                {detail.target ? (
                  <a
                    href={detail.target.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium break-all text-primary hover:underline"
                  >
                    {t(`targetTypes.${detail.target.type}`)} · {new URL(detail.target.url).hostname}
                    <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                  </a>
                ) : (
                  <p>{t("detail.noTarget")}</p>
                )}
              </div>
              <div>
                <p className="text-muted-foreground">{t("detail.nfc")}</p>
                <p>
                  {card.type === "QR_ONLY"
                    ? "—"
                    : [
                        card.nfcWritten ? t("detail.nfcWritten") : t("detail.nfcNotWritten"),
                        card.nfcLocked ? t("detail.nfcLocked") : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("detail.qrTitle")}</CardTitle>
              <CardDescription>{t("detail.qrHint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div
                role="img"
                aria-label={t("detail.qrTitle")}
                className="mx-auto w-48 overflow-hidden rounded-lg bg-white p-1 [&_svg]:h-auto [&_svg]:w-full"
                // Generated on the server by the qrcode library from our own URL; contains no user input.
                dangerouslySetInnerHTML={{ __html: qr }}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={`/app/cards/${card.id}/qr?format=png` as Route} download>
                    <Download data-icon="inline-start" />
                    {t("detail.downloadPng")}
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={`/app/cards/${card.id}/qr?format=svg` as Route} download>
                    <Download data-icon="inline-start" />
                    {t("detail.downloadSvg")}
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
