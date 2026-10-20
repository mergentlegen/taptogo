"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { DataTable, type dataTableFeatures } from "@/components/data/data-table";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import type { EmployeeRow } from "@/server/services/employee-service";

import { deleteEmployeeAction } from "../actions";
import { EmployeeDialog } from "./employee-dialog";

const helper = createColumnHelper<typeof dataTableFeatures, EmployeeRow>();

export function EmployeesTable({
  employees,
  locations,
  canManage,
  showStats,
}: {
  employees: EmployeeRow[];
  locations: { id: string; name: string }[];
  canManage: boolean;
  /** False when the subscription expired: taps and ranks are hidden. */
  showStats: boolean;
}) {
  const t = useTranslations("employees");
  const [pending, startTransition] = useTransition();

  const remove = (employee: EmployeeRow) =>
    startTransition(async () => {
      const result = await deleteEmployeeAction({ employeeId: employee.id });
      if (result.ok) toast.success(t("deleted"));
      else toast.error(result.error.message);
    });

  const columns = helper.columns([
    ...(showStats
      ? [
          helper.accessor((row) => row.rank ?? Number.MAX_SAFE_INTEGER, {
            id: "rank",
            header: t("columns.rank"),
            cell: (info) => (
              <span className="text-muted-foreground tabular-nums">{info.row.original.rank ?? "—"}</span>
            ),
          }),
        ]
      : []),
    helper.accessor("name", {
      header: t("columns.name"),
      cell: (info) => (
        <div className="grid">
          <span className="font-medium">{info.getValue()}</span>
          {info.row.original.position && (
            <span className="text-xs text-muted-foreground">{info.row.original.position}</span>
          )}
        </div>
      ),
    }),
    helper.accessor((row) => row.locationName ?? "", {
      id: "location",
      header: t("columns.location"),
      cell: (info) => info.getValue() || "—",
    }),
    helper.accessor("cardCount", {
      header: t("columns.cards"),
      cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
    }),
    ...(showStats
      ? [
          helper.accessor("taps", {
            header: t("columns.taps"),
            cell: (info) => <span className="font-medium tabular-nums">{formatNumber(info.getValue())}</span>,
          }),
        ]
      : []),
    helper.accessor("isActive", {
      header: t("columns.status"),
      cell: (info) => (
        <span className={info.getValue() ? "" : "text-muted-foreground"}>
          {info.getValue() ? t("active") : t("inactive")}
        </span>
      ),
    }),
    ...(canManage
      ? [
          helper.display({
            id: "actions",
            header: () => <span className="sr-only">{t("edit")}</span>,
            cell: (info) => {
              const employee = info.row.original;
              return (
                <div className="flex justify-end gap-1">
                  <EmployeeDialog
                    employee={employee}
                    locations={locations}
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={`${t("edit")}: ${employee.name}`}>
                        <Pencil />
                      </Button>
                    }
                  />
                  <ConfirmDialog
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={pending}
                        aria-label={`${t("delete")}: ${employee.name}`}
                      >
                        <Trash2 />
                      </Button>
                    }
                    title={t("deleteTitle")}
                    description={t("deleteText", { name: employee.name })}
                    confirmLabel={t("deleteConfirm")}
                    cancelLabel={t("form.cancel")}
                    onConfirm={() => remove(employee)}
                  />
                </div>
              );
            },
          }),
        ]
      : []),
  ]);

  return (
    <DataTable
      columns={columns}
      data={employees}
      getRowId={(row) => row.id}
      renderMobileRow={(employee) => (
        <div className="flex items-center gap-3">
          {showStats && (
            <span className="w-6 text-center text-muted-foreground tabular-nums">{employee.rank ?? "—"}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium">{employee.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {[employee.position, employee.locationName, employee.isActive ? null : t("inactive")]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {showStats && <span className="font-medium tabular-nums">{formatNumber(employee.taps)}</span>}
          {canManage && (
            <EmployeeDialog
              employee={employee}
              locations={locations}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`${t("edit")}: ${employee.name}`}>
                  <Pencil />
                </Button>
              }
            />
          )}
        </div>
      )}
      initialSorting={showStats ? [{ id: "taps", desc: true }] : [{ id: "name", desc: false }]}
      emptyText={t("empty")}
      toolbar={
        canManage ? (
          <EmployeeDialog
            locations={locations}
            trigger={
              <Button className="sm:ml-auto">
                <Plus data-icon="inline-start" />
                {t("add")}
              </Button>
            }
          />
        ) : undefined
      }
    />
  );
}
