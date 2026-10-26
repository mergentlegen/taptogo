"use client";

import { createColumnHelper } from "@tanstack/react-table";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import { DataTable, type dataTableFeatures } from "@/components/data/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { organizationStatuses, type OrganizationStatus } from "@/features/organizations/schemas";
import { formatNumber } from "@/lib/format";
import type { ClientRow } from "@/server/services/admin/client-service";

import { OrganizationBadge } from "./badges";

const helper = createColumnHelper<typeof dataTableFeatures, ClientRow>();
const ALL = "all";

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const t = useTranslations();
  const [status, setStatus] = useState<OrganizationStatus | typeof ALL>(ALL);

  const columns = helper.columns([
    helper.accessor("name", {
      header: t("adm.clients.columns.name"),
      cell: (info) => (
        <Link
          href={`/admin/organizations/${info.row.original.id}` as Route}
          className="font-medium hover:underline"
        >
          {info.getValue()}
        </Link>
      ),
    }),
    helper.accessor((row) => row.city ?? "", { id: "city", header: t("adm.clients.columns.city") }),
    helper.accessor("cards", {
      header: t("adm.clients.columns.cards"),
      cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
    }),
    helper.accessor("taps30", {
      header: t("adm.clients.columns.taps30"),
      cell: (info) => <span className="tabular-nums">{formatNumber(info.getValue())}</span>,
    }),
    helper.accessor("status", {
      header: t("adm.clients.columns.status"),
      cell: (info) => <OrganizationBadge status={info.getValue()} />,
    }),
  ]);

  return (
    <DataTable
      columns={columns}
      data={clients}
      getRowId={(row) => row.id}
      initialSorting={[{ id: "name", desc: false }]}
      searchPlaceholder={t("adm.clients.search")}
      emptyText={t("adm.clients.empty")}
      pageSize={50}
      filter={(row) => status === ALL || row.status === status}
      toolbar={
        <Select value={status} onValueChange={(v) => setStatus(v as OrganizationStatus | typeof ALL)}>
          <SelectTrigger className="min-w-40" aria-label={t("adm.clients.columns.status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("adm.clients.allStatuses")}</SelectItem>
            {organizationStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`adm.orgStatuses.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}
