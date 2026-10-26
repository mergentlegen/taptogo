"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Search } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DataTable, type dataTableFeatures } from "@/components/data/data-table";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CardStatusBadge } from "@/features/cards/components/card-status-badge";
import { cardStatuses, type CardStatus } from "@/features/cards/schemas";
import type { AdminCardRow } from "@/server/services/admin/card-admin-service";

import { assignCardsAction, bulkCardStatusAction } from "../actions";

const helper = createColumnHelper<typeof dataTableFeatures, AdminCardRow>();
const ALL = "all";

type Org = { id: string; name: string; locations: { id: string; name: string }[] };
type Batch = { id: string; name: string; quantity: number };

/** Filters live in the URL and run on the server: the platform may hold far more cards than fit a page. */
export type CardsQuery = { search: string; status: CardStatus | null; batchId: string | null };

export function CardsManager({
  cards,
  total,
  query,
  organizations,
  batches,
  canManage,
}: {
  cards: AdminCardRow[];
  /** All matches on the server; `cards` holds at most the first page of them. */
  total: number;
  query: CardsQuery;
  organizations: Org[];
  batches: Batch[];
  canManage: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState(query.search);
  const navigate = (next: Partial<CardsQuery>) => {
    const merged = { ...query, ...next };
    const params = new URLSearchParams();
    if (merged.search) params.set("search", merged.search);
    if (merged.status) params.set("status", merged.status);
    if (merged.batchId) params.set("batch", merged.batchId);
    setSelected(new Set());
    router.replace(`${pathname}${params.size ? `?${params}` : ""}` as Route);
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns = helper.columns([
    ...(canManage
      ? [
          helper.display({
            id: "select",
            header: () => (
              <span className="sr-only">{t("adm.cards.selected", { count: selected.size })}</span>
            ),
            cell: (info) => (
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={selected.has(info.row.original.id)}
                onChange={() => toggle(info.row.original.id)}
                aria-label={info.row.original.code}
              />
            ),
          }),
        ]
      : []),
    helper.accessor((row) => `${row.code} ${row.label}`, {
      id: "code",
      header: t("adm.cards.columns.code"),
      cell: (info) => <span className="font-mono">{info.row.original.code}</span>,
    }),
    helper.accessor("label", { header: t("adm.cards.columns.label") }),
    helper.accessor((row) => row.organization ?? "", {
      id: "client",
      header: t("adm.cards.columns.client"),
      cell: (info) =>
        info.row.original.organizationId ? (
          <Link
            href={`/admin/organizations/${info.row.original.organizationId}` as Route}
            className="hover:underline"
          >
            {info.getValue()}
          </Link>
        ) : (
          "—"
        ),
    }),
    helper.accessor((row) => row.location ?? "", { id: "location", header: t("adm.cards.columns.location") }),
    helper.accessor((row) => `${row.batch} #${row.number}`, {
      id: "batch",
      header: t("adm.cards.columns.batch"),
      cell: (info) => (
        <Link
          href={`/admin/batches/${info.row.original.batchId}` as Route}
          className="block max-w-48 truncate text-xs hover:underline"
          title={`${info.row.original.batch} · №${info.row.original.number}`}
        >
          {info.row.original.batch} · №{info.row.original.number}
        </Link>
      ),
    }),
    helper.accessor("status", {
      header: t("adm.cards.columns.status"),
      cell: (info) => <CardStatusBadge status={info.getValue()} />,
    }),
    helper.accessor((row) => (row.nfcLocked ? 2 : row.nfcWritten ? 1 : 0), {
      id: "nfc",
      header: t("adm.cards.columns.nfc"),
      cell: (info) =>
        info.row.original.type === "QR_ONLY"
          ? "—"
          : info.row.original.nfcLocked
            ? t("adm.flash.locked")
            : info.row.original.nfcWritten
              ? t("adm.flash.written")
              : "—",
    }),
  ]);

  const selectedCards = cards.filter((c) => selected.has(c.id));

  return (
    <div className="grid gap-3">
      {total > cards.length && (
        <p className="text-sm text-muted-foreground" role="status">
          {t("adm.cards.truncated", { shown: cards.length, total })}
        </p>
      )}
      <DataTable
        columns={columns}
        data={cards}
        getRowId={(row) => row.id}
        pageSize={50}
        emptyText={t("adm.clients.detail.noItems")}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <form
              role="search"
              className="relative"
              onSubmit={(event) => {
                event.preventDefault();
                navigate({ search: search.trim().slice(0, 40) });
              }}
            >
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("adm.cards.codeSearch")}
                aria-label={t("adm.cards.codeSearch")}
                maxLength={40}
                className="w-56 pl-8"
              />
            </form>
            <Select
              value={query.status ?? ALL}
              onValueChange={(v) => navigate({ status: v === ALL ? null : (v as CardStatus) })}
            >
              <SelectTrigger className="min-w-36" aria-label={t("adm.cards.columns.status")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("adm.cards.allStatuses")}</SelectItem>
                {cardStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`cards.statuses.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={query.batchId ?? ALL}
              onValueChange={(v) => navigate({ batchId: v === ALL ? null : v })}
            >
              <SelectTrigger className="min-w-44" aria-label={t("adm.cards.columns.batch")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t("adm.cards.allBatches")}</SelectItem>
                {batches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground" role="status">
              {t("adm.cards.selected", { count: selected.size })}
            </span>
            {canManage && (
              <>
                <AssignDialog
                  organizations={organizations}
                  batches={batches}
                  selectedIds={[...selected]}
                  onDone={() => setSelected(new Set())}
                />
                <StatusDialog
                  cardIds={selectedCards.map((c) => c.id)}
                  statuses={[...cardStatuses]}
                  onDone={() => setSelected(new Set())}
                />
              </>
            )}
          </div>
        }
      />
    </div>
  );
}

function AssignDialog({
  organizations,
  batches,
  selectedIds,
  onDone,
}: {
  organizations: Org[];
  batches: Batch[];
  selectedIds: string[];
  onDone: () => void;
}) {
  const t = useTranslations("adm.cards");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"selected" | "range" | "codes">(selectedIds.length ? "selected" : "codes");
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [locationId, setLocationId] = useState<string>("none");
  const [range, setRange] = useState({ batchId: batches[0]?.id ?? "", from: "1", to: "1" });
  const [codes, setCodes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const org = organizations.find((o) => o.id === organizationId);

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const result = await assignCardsAction({
        organizationId,
        locationId: locationId === "none" ? "" : locationId,
        ...(mode === "selected" && { cardIds: selectedIds }),
        ...(mode === "codes" && { codes }),
        ...(mode === "range" && {
          range: { batchId: range.batchId, from: Number(range.from), to: Number(range.to) },
        }),
      });
      if (result.ok) {
        toast.success(t("assigned", { count: result.data.count }));
        setOpen(false);
        onDone();
      } else {
        setError(result.error.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">{t("assign")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("assignTitle")}</DialogTitle>
          <DialogDescription>{t("codesHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {error && <FormAlert>{error}</FormAlert>}
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={mode}
            onValueChange={(v) => v && setMode(v as typeof mode)}
            className="flex-wrap"
          >
            {(["selected", "range", "codes"] as const).map((m) => (
              <ToggleGroupItem key={m} value={m}>
                {t(`assignModes.${m}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {mode === "selected" && (
            <p className="text-sm text-muted-foreground">
              {selectedIds.length ? t("selected", { count: selectedIds.length }) : t("noSelection")}
            </p>
          )}
          {mode === "range" && (
            <div className="grid grid-cols-[minmax(0,1fr)_5rem_5rem] gap-2">
              <FormField label={t("batch")}>
                <Select
                  value={range.batchId}
                  onValueChange={(batchId) => setRange((r) => ({ ...r, batchId }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {batches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label={t("from")}>
                <Input
                  type="number"
                  min={1}
                  value={range.from}
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                />
              </FormField>
              <FormField label={t("to")}>
                <Input
                  type="number"
                  min={1}
                  value={range.to}
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                />
              </FormField>
            </div>
          )}
          {mode === "codes" && (
            <FormField label={t("codes")} hint={t("codesHint")}>
              <Textarea
                rows={4}
                value={codes}
                onChange={(e) => setCodes(e.target.value)}
                className="font-mono"
              />
            </FormField>
          )}

          <FormField label={t("client")}>
            <Select
              value={organizationId}
              onValueChange={(v) => {
                setOrganizationId(v);
                setLocationId("none");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("location")}>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("noLocation")}</SelectItem>
                {org?.locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !organizationId}>
            {t("assign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({
  cardIds,
  statuses,
  onDone,
}: {
  cardIds: string[];
  statuses: CardStatus[];
  onDone: () => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<CardStatus>(
    statuses.includes("PAUSED") ? "PAUSED" : (statuses[0] ?? "PAUSED"),
  );
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await bulkCardStatusAction({ cardIds, status });
      if (result.ok) {
        toast.success(t("adm.cards.statusChanged"));
        setOpen(false);
        onDone();
      } else toast.error(result.error.message);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={cardIds.length === 0}>
          {t("adm.cards.changeStatus")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adm.cards.changeStatus")}</DialogTitle>
          <DialogDescription>{t("adm.cards.selected", { count: cardIds.length })}</DialogDescription>
        </DialogHeader>
        <Select value={status} onValueChange={(v) => setStatus(v as CardStatus)}>
          <SelectTrigger className="w-full" aria-label={t("adm.cards.columns.status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "UNASSIGNED" ? t("adm.cards.unassign") : t(`cards.statuses.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {t("adm.common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
