"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { AuditRow } from "@/server/services/admin/audit-query-service";

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
      {value === null || value === undefined ? "—" : JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Audit entries with a before/after viewer. Values are rendered as text, never as HTML. */
export function AuditTable({ items, showClient = true }: { items: AuditRow[]; showClient?: boolean }) {
  const t = useTranslations("adm.audit");

  if (items.length === 0)
    return <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>;

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("columns.time")}</TableHead>
            <TableHead>{t("columns.actor")}</TableHead>
            <TableHead>{t("columns.action")}</TableHead>
            <TableHead>{t("columns.entity")}</TableHead>
            {showClient && <TableHead>{t("columns.client")}</TableHead>}
            <TableHead>
              <span className="sr-only">{t("details")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id} data-testid="audit-row">
              <TableCell className="whitespace-nowrap tabular-nums">
                {formatDateTime(item.createdAt)}
              </TableCell>
              <TableCell>{item.actor ?? t("system")}</TableCell>
              <TableCell className="font-mono text-xs">{item.action}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {item.entityType}
                {item.entityId && <span className="block font-mono">{item.entityId.slice(0, 8)}</span>}
              </TableCell>
              {showClient && <TableCell>{item.organization ?? "—"}</TableCell>}
              <TableCell className="text-right">
                {(item.before !== null || item.after !== null) && (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        {t("details")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle className="font-mono text-base">{item.action}</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-1">
                          <p className="text-sm font-medium">{t("before")}</p>
                          <Json value={item.before} />
                        </div>
                        <div className="grid gap-1">
                          <p className="text-sm font-medium">{t("after")}</p>
                          <Json value={item.after} />
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
