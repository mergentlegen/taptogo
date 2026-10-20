"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Plus, ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { DataTable, type dataTableFeatures } from "@/components/data/data-table";
import { FormAlert } from "@/components/forms/form-alert";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { redirectTargetTypes, type RedirectTargetType } from "@/features/targets/schemas";
import type { TargetRow } from "@/server/services/admin/target-service";

import { checkTargetUrlAction, createTargetAction, setTargetVerifiedAction } from "../actions";
import { YesNoBadge } from "./badges";

const helper = createColumnHelper<typeof dataTableFeatures, TargetRow>();
type Org = { id: string; name: string; locations: { id: string; name: string }[] };

export function TargetsManager({
  targets,
  organizations,
  canManage,
}: {
  targets: TargetRow[];
  organizations: Org[];
  canManage: boolean;
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();

  const setVerified = (target: TargetRow, isVerified: boolean) =>
    startTransition(async () => {
      const result = await setTargetVerifiedAction({ targetId: target.id, isVerified });
      if (result.ok) toast.success(t("adm.common.saved"));
      else toast.error(result.error.message);
    });

  const columns = helper.columns([
    helper.accessor("organization", { header: t("adm.targets.columns.client") }),
    helper.accessor((row) => row.location ?? "", {
      id: "location",
      header: t("adm.targets.columns.location"),
    }),
    helper.accessor("type", {
      header: t("adm.targets.columns.type"),
      cell: (i) => t(`cards.targetTypes.${i.getValue()}`),
    }),
    helper.accessor("url", {
      header: t("adm.targets.columns.url"),
      cell: (i) => (
        <span className="block max-w-56 truncate font-mono text-xs" title={i.getValue()}>
          {i.getValue()}
        </span>
      ),
    }),
    helper.accessor("allowed", {
      header: t("adm.targets.columns.domain"),
      cell: (i) => (
        <YesNoBadge
          value={i.getValue()}
          yes={t("adm.targets.domainOk")}
          no={t("adm.targets.domainBlocked")}
        />
      ),
    }),
    helper.accessor("isVerified", {
      header: t("adm.targets.columns.verified"),
      cell: (i) => (
        <YesNoBadge value={i.getValue()} yes={t("adm.targets.verified")} no={t("adm.targets.notVerified")} />
      ),
    }),
    helper.accessor("cardsUsing", { header: t("adm.targets.columns.cards") }),
    ...(canManage
      ? [
          helper.display({
            id: "actions",
            header: () => <span className="sr-only">{t("adm.common.actions")}</span>,
            cell: (i) => {
              const target = i.row.original;
              return target.isVerified ? (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={pending}
                  title={t("adm.targets.unverifyHint")}
                  aria-label={t("adm.targets.unverify")}
                  onClick={() => setVerified(target, false)}
                >
                  <ShieldOff />
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={pending || !target.allowed}
                  onClick={() => setVerified(target, true)}
                >
                  <ShieldCheck data-icon="inline-start" />
                  {t("adm.targets.verify")}
                </Button>
              );
            },
          }),
        ]
      : []),
  ]);

  return (
    <DataTable
      columns={columns}
      data={targets}
      getRowId={(row) => row.id}
      searchPlaceholder={t("adm.common.search")}
      emptyText={t("adm.clients.detail.noItems")}
      initialSorting={[{ id: "organization", desc: false }]}
      pageSize={50}
      toolbar={canManage ? <CreateTargetDialog organizations={organizations} /> : undefined}
    />
  );
}

function CreateTargetDialog({ organizations }: { organizations: Org[] }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState(organizations[0]?.id ?? "");
  const [locationId, setLocationId] = useState("none");
  const [type, setType] = useState<RedirectTargetType>("TWOGIS_REVIEW");
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const org = organizations.find((o) => o.id === organizationId);

  const check = () =>
    startTransition(async () => {
      const result = await checkTargetUrlAction({ url });
      if (!result.ok) return setMessage({ ok: false, text: result.error.message });
      setMessage(
        result.data.ok
          ? { ok: true, text: t("adm.targets.checkOk") }
          : { ok: false, text: t(`adm.targets.reasons.${result.data.reason}`) },
      );
    });

  const submit = () =>
    startTransition(async () => {
      const result = await createTargetAction({
        organizationId,
        locationId: locationId === "none" ? "" : locationId,
        type,
        url,
      });
      if (result.ok) {
        toast.success(t("adm.targets.created"));
        setUrl("");
        setMessage(null);
        setOpen(false);
      } else setMessage({ ok: false, text: result.error.message });
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="sm:ml-auto">
          <Plus data-icon="inline-start" />
          {t("adm.targets.new")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("adm.targets.new")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {message && <FormAlert variant={message.ok ? "success" : "error"}>{message.text}</FormAlert>}
          <FormField label={t("adm.targets.client")}>
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
          <FormField label={t("adm.targets.location")}>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("adm.cards.noLocation")}</SelectItem>
                {org?.locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label={t("adm.targets.type")}>
            <Select value={type} onValueChange={(v) => setType(v as RedirectTargetType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {redirectTargetTypes.map((x) => (
                  <SelectItem key={x} value={x}>
                    {t(`cards.targetTypes.${x}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <div className="flex items-end gap-2">
            <FormField label={t("adm.targets.url")} className="flex-1">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://2gis.kz/…" />
            </FormField>
            <Button type="button" variant="outline" disabled={pending || !url} onClick={check}>
              {t("adm.targets.check")}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !url || !organizationId}>
            {t("adm.common.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
