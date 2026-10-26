import { MapPin } from "lucide-react";
import type { Metadata, Route } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { EmptyState } from "@/components/data/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { features } from "@/config/features";
import { formatNumber, formatRating } from "@/lib/format";
import { requireOrgAccess } from "@/server/auth/session";
import { getServices } from "@/server/services";
import { orgContextFrom } from "@/server/services/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.pages.locations");
  return { title: t("title") };
}

export default async function LocationsPage() {
  const access = await requireOrgAccess("org.view");
  const ctx = orgContextFrom(access);
  const services = getServices();
  const locations = await services.locations.list(ctx);
  const t = await getTranslations();

  return (
    <>
      <PageHeader title={t("app.pages.locations.title")} description={t("app.pages.locations.description")} />
      {locations.length === 0 ? (
        <EmptyState icon={MapPin} title={t("locations.empty")} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {locations.map((location) => (
            <Link
              key={location.id}
              href={`/app/locations/${location.id}` as Route}
              className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="grid gap-3">
                  <div>
                    <p className="font-semibold">{location.name}</p>
                    <p className="text-sm text-muted-foreground">{location.address}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {location.linkedToTwogis ? t("locations.linked") : t("locations.notLinked")}
                  </p>
                  {features.twogisApi && location.linkedToTwogis && (
                    <p className="text-sm">
                      {t("dashboard.kpi.rating")}:{" "}
                      {location.rating === null ? "—" : formatRating(location.rating)} ·{" "}
                      {t("locations.columns.reviews")}:{" "}
                      {location.reviewCount === null ? "—" : formatNumber(location.reviewCount)}
                    </p>
                  )}
                  <dl className="grid grid-cols-2 gap-2 border-t pt-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("locations.columns.taps30")}</dt>
                      <dd className="font-medium tabular-nums">{formatNumber(location.taps30)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">{t("locations.columns.cards")}</dt>
                      <dd className="font-medium tabular-nums">{location.cardCount}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
