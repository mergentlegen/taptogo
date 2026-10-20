"use client";

import { MessageSquareShare } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Textarea } from "@/components/ui/textarea";

import { requestTwogisChangeAction } from "../actions";

/** 2GIS links are changed by TapToGo support; this files a ticket instead of editing directly. */
export function TwogisChangeDialog({ locationId }: { locationId: string }) {
  const t = useTranslations("locations.change");
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await requestTwogisChangeAction({ locationId, message });
      if (result.ok) {
        toast.success(t("sent"));
        setMessage("");
        setOpen(false);
      } else {
        setError(result.error.fieldErrors?.message?.[0] ?? result.error.message);
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageSquareShare data-icon="inline-start" />
          {t("button")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("text")}</DialogDescription>
        </DialogHeader>
        {error && <FormAlert>{error}</FormAlert>}
        <FormField label={t("message")}>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("placeholder")}
            maxLength={2000}
            rows={4}
          />
        </FormField>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || message.trim().length === 0}>
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
