"use client";

import { Mail, MessageCircle, Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { salesContacts } from "@/config/contacts";

/** Online payment is out of MVP scope: renewal goes through a manager. */
export function ContactDialog({
  triggerLabel,
  variant = "default",
}: {
  triggerLabel: string;
  variant?: "default" | "outline";
}) {
  const t = useTranslations("subscription");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={variant}>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("contactTitle")}</DialogTitle>
          <DialogDescription>{t("contactText")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Button asChild variant="outline" className="justify-start">
            <a href={salesContacts.phoneHref}>
              <Phone data-icon="inline-start" />
              {salesContacts.phone}
            </a>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <a href={salesContacts.whatsappHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle data-icon="inline-start" />
              WhatsApp
            </a>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <a href={`mailto:${salesContacts.email}`}>
              <Mail data-icon="inline-start" />
              {salesContacts.email}
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
