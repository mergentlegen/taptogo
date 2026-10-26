import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/layout/page-header";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketForm } from "@/features/support/components/ticket-form";
import { formatDateTime } from "@/lib/format";
import { requireOrgAccess } from "@/server/auth/session";
import { getServices } from "@/server/services";
import { orgContextFrom } from "@/server/services/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.pages.support");
  return { title: t("title") };
}

const FAQ = [1, 2, 3, 4, 5, 6] as const;

export default async function SupportPage() {
  const access = await requireOrgAccess("org.support");
  const ctx = orgContextFrom(access);
  const [tickets, t] = await Promise.all([getServices().support.list(ctx), getTranslations()]);

  return (
    <>
      <PageHeader title={t("app.pages.support.title")} description={t("app.pages.support.description")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("support.formTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <TicketForm />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("support.listTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              {tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("support.empty")}</p>
              ) : (
                <ul className="divide-y" data-testid="tickets">
                  {tickets.map((ticket) => (
                    <li key={ticket.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{ticket.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(ticket.createdAt, ctx.timeZone)}
                        </p>
                      </div>
                      <Badge variant={ticket.status === "CLOSED" ? "outline" : "secondary"}>
                        {t(`support.statuses.${ticket.status}`)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
        <Card className="content-start">
          <CardHeader>
            <CardTitle>{t("support.faqTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible>
              {FAQ.map((n) => (
                <AccordionItem key={n} value={`q${n}`}>
                  <AccordionTrigger>{t(`support.faq.q${n}`)}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {t(`support.faq.a${n}`)}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
