import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommentThread, InboxControls } from "@/features/admin/components/inbox-components";
import { formatDateTime } from "@/lib/format";
import { requirePlatformAccess } from "@/server/auth/session";
import { can } from "@/server/permissions";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.leads");
  return { title: t("title") };
}

/** Landing-page requests. Few of them, so each lead is a card with its own thread. */
export default async function AdminLeadsPage() {
  const { actor } = await requirePlatformAccess("admin.access");
  const inbox = getServices().admin.inbox;
  const [leads, staff, t] = await Promise.all([inbox.leads(), inbox.staffOptions(), getTranslations()]);
  const comments = await inbox.commentsFor(
    "LEAD",
    leads.map((lead) => lead.id),
  );
  const canWork = can(actor, "admin.inbox");

  return (
    <>
      <PageHeader title={t("admin.pages.leads.title")} description={t("admin.pages.leads.description")} />
      {leads.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">{t("adm.inbox.empty")}</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {leads.map((lead) => (
            <Card key={lead.id} id={`lead-${lead.id}`} data-testid="lead" className="scroll-mt-20">
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base">{lead.businessName}</CardTitle>
                  <CardDescription>
                    {lead.name} ·{" "}
                    <a href={`tel:${lead.phone}`} className="hover:underline">
                      {lead.phone}
                    </a>
                    {lead.city && ` · ${lead.city}`} · {formatDateTime(lead.createdAt)}
                  </CardDescription>
                </div>
                <InboxControls
                  kind="lead"
                  id={lead.id}
                  status={lead.status}
                  assigneeId={lead.assigneeId}
                  staff={staff}
                  disabled={!canWork}
                />
              </CardHeader>
              <CardContent className="grid gap-4">
                {lead.message && <p className="text-sm whitespace-pre-wrap">{lead.message}</p>}
                <CommentThread
                  subjectType="LEAD"
                  subjectId={lead.id}
                  comments={comments.get(lead.id) ?? []}
                  canComment={canWork}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
