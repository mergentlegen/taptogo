"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { DataTable, type dataTableFeatures } from "@/components/data/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatNumber } from "@/lib/format";
import type { CardListItem } from "@/server/services/card-service";

import { cardStatuses, type CardStatus } from "../schemas";
import { CardStatusBadge } from "./card-status-badge";

const helper = createColumnHelper<typeof dataTableFeatures, CardListItem>();
const ALL = "all";

export function CardsTable({
  cards,
  locations,
  showStats = true,
}: {
  cards: CardListItem[];
  locations: { id: string; name: string }[];
  timeZone: string;
  showStats?: boolean;
}) {
  const t = useTranslations("cards");
  const [status, setStatus] = useState<CardStatus | typeof ALL>(ALL);
  const [location, setLocation] = useState<string>(ALL);

  const columns = helper.columns([
    // The value includes the printed code, so the search box finds cards by code too.
    helper.accessor((row) => `${row.label} ${row.code}`, {
      id: "label",
      header: t("columns.label"),
      cell: (info) => (
        <div className="grid">
          <Link href={`/app/cards/${info.row.original.id}` as Route} className="font-medium hover:underline">
            {info.row.original.label}
          </Link>
        </div>
      ),
    }),
    helper.accessor((row) => row.locationName ?? "", {
      id: "location",
      header: t("columns.location"),
      cell: (info) => info.getValue() || "—",
    }),
    helper.accessor("status", {
      header: t("columns.status"),
      cell: (info) => <CardStatusBadge customer status={info.getValue()} />,
    }),
    ...(showStats
      ? [
          helper.accessor("taps30", {
            header: t("columns.taps30"),
            cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
          }),
        ]
      : []),
  ]);

  return (
    <DataTable
      columns={columns}
      data={cards}
      getRowId={(row) => row.id}
      renderMobileRow={(card) => (
        <Link href={`/app/cards/${card.id}` as Route} className="grid gap-1.5">
          <span className="flex items-start justify-between gap-2">
            <span className="font-medium">{card.label}</span>
            <CardStatusBadge customer status={card.status} />
          </span>
          <span className="text-sm text-muted-foreground">
            {[card.locationName, card.employeeName].filter(Boolean).join(" · ") || "—"}
          </span>
          {showStats && (
            <span className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("columns.taps30")}</span>
              <span className="font-medium tabular-nums">{formatNumber(card.taps30)}</span>
            </span>
          )}
        </Link>
      )}
      initialSorting={showStats ? [{ id: "taps30", desc: true }] : [{ id: "label", desc: false }]}
      searchPlaceholder={t("search")}
      emptyText={cards.length === 0 ? t("empty") : t("noResults")}
      filter={(row) =>
        (status === ALL || row.status === status) && (location === ALL || row.locationId === location)
      }
      toolbar={
        <div className="flex flex-wrap gap-2">
          <Select value={status} onValueChange={(v) => setStatus(v as CardStatus | typeof ALL)}>
            <SelectTrigger className="min-w-40" aria-label={t("columns.status")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("allStatuses")}</SelectItem>
              {cardStatuses
                .filter((s) => s !== "UNASSIGNED")
                .map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`customerStatuses.${s}`)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {locations.length > 1 && (
            <Select value={location} onValueChange={setLocation}>
              <SelectTrigger className="min-w-44" aria-label={t("columns.location")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("allLocations")}</SelectItem>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      }
    />
  );
}
