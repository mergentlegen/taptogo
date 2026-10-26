"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { QueuedMessage } from "@/server/providers/email/types";

import { markOutboxSentAction } from "../actions";

/** Messages to send by hand. The text is copied as is: it already contains the one-time link. */
export function OutboxList({ messages }: { messages: QueuedMessage[] }) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const pendingCount = messages.filter((m) => m.sentAt === null).length;

  if (messages.length === 0) {
    return <p className="py-10 text-center text-muted-foreground">{t("adm.outbox.empty")}</p>;
  }

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(t("adm.common.copied"));
  };
  const markSent = (id: string) =>
    startTransition(async () => {
      const result = await markOutboxSentAction({ id });
      if (!result.ok) toast.error(result.error.message);
    });

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground" role="status">
        {t("adm.outbox.pending", { count: pendingCount })}
      </p>
      {messages.map((message) => (
        <Card key={message.id} data-testid="outbox-message">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid gap-1">
              <CardTitle className="text-base">{message.subject}</CardTitle>
              <CardDescription>
                {t("adm.outbox.to", { email: message.to })} · {formatDateTime(message.queuedAt)} ·{" "}
                {t(`adm.outbox.tags.${message.tag}`)}
              </CardDescription>
            </div>
            {message.sentAt ? (
              <span className="inline-flex items-center gap-1 text-sm text-success">
                <Check className="size-4" aria-hidden="true" />
                {t("adm.outbox.sentAt", { date: formatDateTime(message.sentAt) })}
              </span>
            ) : null}
          </CardHeader>
          <CardContent className="grid gap-3">
            <pre className="rounded-lg bg-muted p-3 font-sans text-sm whitespace-pre-wrap">
              {message.text}
            </pre>
            {message.sentAt === null && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => copy(message.text)}>
                  <Copy data-icon="inline-start" />
                  {t("adm.outbox.copy")}
                </Button>
                <Button disabled={pending} onClick={() => markSent(message.id)}>
                  <Check data-icon="inline-start" />
                  {t("adm.outbox.markSent")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
