import { ArrowLeft } from "lucide-react";
import type { Metadata, Route } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommentThread, InboxControls } from "@/features/admin/components/inbox-components";
import { formatDateTime } from "@/lib/format";
import { requirePlatformAccess } from "@/server/auth/session";
import { can } from "@/server/permissions";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.pages.support");
  return { title: t("title") };
}

export default async function AdminTicketPage({ params }: PageProps<"/admin/support/[id]">) {
  const { actor } = await requirePlatformAccess("admin.access");
  const inbox = getServices().admin.inbox;
  const [detail, staff, t] = await Promise.all([
    inbox.ticket((await params).id),
    inbox.staffOptions(),
    getTranslations("adm.inbox"),
  ]);
  if (!detail) notFound();
  const { ticket, comments } = detail;
  const canWork = can(actor, "admin.inbox");

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/admin/support">
          <ArrowLeft data-icon="inline-start" />
          {t("back")}
        </Link>
      </Button>
      <PageHeader
        title={ticket.subject}
        description={`${ticket.organization} · ${ticket.author} · ${formatDateTime(ticket.createdAt)}`}
        actions={
          <InboxControls
            id={ticket.id}
            status={ticket.status}
            assigneeId={ticket.assigneeId}
            staff={staff}
            disabled={!canWork}
          />
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("message")}</CardTitle>
            <CardDescription>
              <Link
                href={`/admin/organizations/${ticket.organizationId}` as Route}
                className="hover:underline"
              >
                {ticket.organization}
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{ticket.body}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("comments")}</CardTitle>
            <CardDescription>{t("commentsHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <CommentThread
              subjectType="TICKET"
              subjectId={ticket.id}
              comments={comments}
              canComment={canWork}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
