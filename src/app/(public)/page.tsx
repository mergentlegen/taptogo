import { ArrowRight, ChartLine, Check, ChevronDown, MessageCircle, Nfc, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { salesContacts, whatsappLink } from "@/config/contacts";
import { DashboardPreview } from "@/features/landing/components/dashboard-preview";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  // The root layout's default title; set explicitly so the landing has full Open Graph tags.
  return {
    title: { absolute: t("title") },
    description: t("description"),
    openGraph: { title: t("title"), description: t("description"), type: "website", locale: "ru_KZ" },
  };
}

type FaqItem = { q: string; a: string };

const steps = [
  { key: "place", icon: Nfc },
  { key: "tap", icon: Smartphone },
  { key: "track", icon: ChartLine },
] as const;

function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
  className,
}: {
  id: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn("scroll-mt-16", className)}>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-2xl gap-3 text-center">
          <p className="text-sm font-semibold text-primary">{eyebrow}</p>
          <h2 id={`${id}-title`} className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {title}
          </h2>
          {subtitle && <p className="text-lg text-balance text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const t = await getTranslations("public");
  const faq = t.raw("faq.items") as FaqItem[];
  const included = t.raw("features.items") as string[];
  const chat = whatsappLink(t("contact.message"));

  return (
    <>
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[28rem] max-w-3xl rounded-full bg-primary/15 blur-3xl"
        />
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 pt-20 pb-12 text-center sm:pt-28">
          <LogoMark className="size-14" />
          <p className="rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("home.eyebrow")}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">{t("home.title")}</h1>
          <p className="max-w-xl text-lg text-balance text-muted-foreground">{t("home.subtitle")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <a href={chat} target="_blank" rel="noopener noreferrer">
                <MessageCircle data-icon="inline-start" />
                {t("home.primaryCta")}
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/app">{t("home.secondaryCta")}</Link>
            </Button>
          </div>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            {(["noApp", "nfcQr", "stats"] as const).map((key) => (
              <li key={key} className="flex items-center gap-1.5">
                <Check className="size-4 text-primary" aria-hidden="true" />
                {t(`home.highlights.${key}`)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Section id="how-it-works" eyebrow={t("howItWorks.eyebrow")} title={t("howItWorks.title")}>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map(({ key, icon: Icon }, index) => (
            <li key={key}>
              <Card className="h-full">
                <CardHeader className="gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                      <Icon className="size-6" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-semibold text-muted-foreground tabular-nums">
                      {index + 1} / {steps.length}
                    </span>
                  </div>
                  <CardTitle className="text-lg">{t(`howItWorks.steps.${key}.title`)}</CardTitle>
                  <CardDescription className="text-base">{t(`howItWorks.steps.${key}.text`)}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="preview"
        eyebrow={t("preview.eyebrow")}
        title={t("preview.title")}
        subtitle={t("preview.subtitle")}
        className="bg-muted/40"
      >
        <DashboardPreview />
      </Section>

      <Section
        id="features"
        eyebrow={t("features.eyebrow")}
        title={t("features.title")}
        subtitle={t("features.subtitle")}
      >
        <div className="mx-auto grid w-full max-w-3xl gap-4 rounded-2xl border bg-card p-6">
          <ul className="grid gap-3 text-sm sm:grid-cols-2">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{t("features.note")}</p>
        </div>
      </Section>

      <Section id="faq" eyebrow={t("faq.eyebrow")} title={t("faq.title")} className="bg-muted/40">
        <div className="mx-auto grid w-full max-w-3xl gap-3">
          {faq.map((item) => (
            <details key={item.q} className="group rounded-xl border bg-card px-5 py-4 open:pb-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="mt-3 text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section
        id="contact"
        eyebrow={t("contact.eyebrow")}
        title={t("contact.title")}
        subtitle={t("contact.subtitle")}
      >
        <div className="mx-auto grid justify-items-center gap-3 text-center">
          <Button asChild size="lg">
            <a href={chat} target="_blank" rel="noopener noreferrer">
              <MessageCircle data-icon="inline-start" />
              {t("contact.cta")}
              <ArrowRight data-icon="inline-end" />
            </a>
          </Button>
          <p className="text-sm text-muted-foreground">
            {t("contact.numberLabel")}:{" "}
            <span className="font-medium text-foreground">{salesContacts.whatsapp}</span>
          </p>
        </div>
      </Section>
    </>
  );
}
