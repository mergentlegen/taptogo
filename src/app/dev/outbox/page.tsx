import { Mail } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnv } from "@/env";
import { getContainer } from "@/server/container";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dev.outbox");
  return { title: t("title") };
}

const dateTime = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "Asia/Almaty",
});

/** Turns bare URLs in plain-text emails into links. */
function Linkified({ text }: { text: string }) {
  return text.split(/(https?:\/\/\S+)/g).map((part, index) =>
    /^https?:\/\//.test(part) ? (
      <a key={index} href={part} className="break-all text-primary underline underline-offset-2">
        {part}
      </a>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

/** Emails "sent" by ConsoleEmailProvider (dev only; the /dev layout returns 404 in production). */
export default async function DevOutboxPage() {
  const t = await getTranslations("dev.outbox");
  const { devOutbox, demo } = getContainer();
  const emails = devOutbox?.list() ?? [];
  // Seeded pending invitation, so the invite flow can be tried before stage 5 adds the team page.
  const demoInviteLink = demo ? new URL(`/invite/${demo.invitationToken}`, getEnv().APP_URL) : null;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      {demoInviteLink && (
        <p className="mb-6 text-sm text-muted-foreground">
          {t("demoInvite")}{" "}
          <a href={demoInviteLink.pathname} className="text-primary underline underline-offset-2">
            {demoInviteLink.pathname}
          </a>
        </p>
      )}

      {emails.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">{t("empty")}</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4" data-testid="outbox">
          {emails.map((email) => (
            <Card key={email.id}>
              <CardHeader className="gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
                  <CardTitle className="text-base">{email.subject}</CardTitle>
                  <Badge variant="secondary">{email.tag}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("to")}: {email.to} · {dateTime.format(new Date(email.sentAt))}
                </p>
              </CardHeader>
              <CardContent>
                <pre className="font-sans text-sm whitespace-pre-wrap">
                  <Linkified text={email.text} />
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
