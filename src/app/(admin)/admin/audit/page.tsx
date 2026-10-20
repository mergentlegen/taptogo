import type { Metadata, Route } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuditTable } from "@/features/admin/components/audit-table";
import { searchParam } from "@/lib/period";
import { requirePlatformAccess } from "@/server/auth/session";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.audit");
  return { title: t("title") };
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Filters are a plain GET form: every view of the log is a shareable URL. */
export default async function AdminAuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requirePlatformAccess("admin.access");
  const params = await searchParams;
  const pick = (key: string, max = 80) => searchParam(params[key])?.slice(0, max) || undefined;
  const query = {
    actorUserId: pick("actor"),
    organizationId: pick("organization"),
    action: pick("action", 64),
    entityType: pick("entity", 40),
    from: pick("from")?.match(isoDate) ? pick("from") : undefined,
    to: pick("to")?.match(isoDate) ? pick("to") : undefined,
    cursor: pick("cursor"),
  };
  const audit = getServices().admin.audit;
  const [page, options, t] = await Promise.all([audit.list(query), audit.filterOptions(), getTranslations()]);

  const nextParams = new URLSearchParams(
    Object.entries({
      actor: query.actorUserId,
      organization: query.organizationId,
      action: query.action,
      entity: query.entityType,
      from: query.from,
      to: query.to,
      cursor: page.nextCursor ?? undefined,
    }).filter((e): e is [string, string] => Boolean(e[1])),
  );

  return (
    <>
      <PageHeader title={t("admin.pages.audit.title")} description={t("admin.pages.audit.description")} />
      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <select
          name="actor"
          defaultValue={query.actorUserId ?? ""}
          className={selectClass}
          aria-label={t("adm.audit.columns.actor")}
        >
          <option value="">{t("adm.audit.anyActor")}</option>
          {options.actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          name="organization"
          defaultValue={query.organizationId ?? ""}
          className={selectClass}
          aria-label={t("adm.audit.columns.client")}
        >
          <option value="">{t("adm.audit.anyClient")}</option>
          {options.organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <Input
          name="action"
          defaultValue={query.action}
          placeholder={t("adm.audit.actionPrefix")}
          className="w-52"
          aria-label={t("adm.audit.actionPrefix")}
        />
        <Input
          name="entity"
          defaultValue={query.entityType}
          placeholder={t("adm.audit.entityType")}
          className="w-36"
          aria-label={t("adm.audit.entityType")}
        />
        <Input
          type="date"
          name="from"
          defaultValue={query.from}
          className="w-auto"
          aria-label={t("adm.audit.from")}
        />
        <Input
          type="date"
          name="to"
          defaultValue={query.to}
          className="w-auto"
          aria-label={t("adm.audit.to")}
        />
        <Button type="submit" size="sm">
          {t("adm.audit.apply")}
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/admin/audit">{t("adm.audit.reset")}</Link>
        </Button>
      </form>
      <AuditTable items={page.items} />
      {page.nextCursor && (
        <div className="mt-3 flex justify-center">
          <Button asChild variant="outline">
            <Link href={`/admin/audit?${nextParams.toString()}` as Route}>{t("adm.audit.more")}</Link>
          </Button>
        </div>
      )}
    </>
  );
}
