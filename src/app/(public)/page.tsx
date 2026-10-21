import {
  ArrowRight,
  ChartLine,
  Check,
  ChevronDown,
  Mail,
  MessageCircle,
  Nfc,
  Phone,
  Smartphone,
} from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { salesContacts } from "@/config/contacts";
import { getEnv } from "@/env";
import { DashboardPreview } from "@/features/landing/components/dashboard-preview";
import { LeadForm } from "@/features/leads/components/lead-form";
import { formatKzt } from "@/lib/format";
import { homepageSchema, serializeJsonLd } from "@/lib/homepage-schema";
import { cn } from "@/lib/utils";
import { getServices } from "@/server/services";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  const url = new URL("/", getEnv().APP_URL).href;
  // The root layout's default title; set explicitly so the landing has full Open Graph tags.
  return {
    title: { absolute: t("title") },
    description: t("description"),
    alternates: { canonical: url },
    openGraph: {
      title: t("title"),
      description: t("description"),
      type: "website",
      locale: "ru_KZ",
      url,
      siteName: "TapToGo",
    },
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
  const [t, tPlans, plans] = await Promise.all([
    getTranslations("public"),
    getTranslations("subscription.plans"),
    getServices().leads.plans(),
  ]);
  const faq = t.raw("faq.items") as FaqItem[];
  const included = t.raw("pricing.included") as string[];
  const [metadata, locale, requestHeaders] = await Promise.all([
    getTranslations("metadata"),
    getLocale(),
    headers(),
  ]);
  const schema = homepageSchema(getEnv().APP_URL, metadata("title"), metadata("description"), locale);

  return (
    <>
      <script
        type="application/ld+json"
        nonce={requestHeaders.get("x-nonce") ?? undefined}
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
      />
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
              <Link href={{ pathname: "/", hash: "contact" }}>
                {t("home.primaryCta")}
                <ArrowRight data-icon="inline-end" />
              </Link>
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
        id="pricing"
        eyebrow={t("pricing.eyebrow")}
        title={t("pricing.title")}
        subtitle={t("pricing.subtitle")}
      >
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <Card key={plan.plan} data-testid="plan">
              <CardHeader>
                <CardTitle className="text-lg">{tPlans(plan.plan)}</CardTitle>
                <CardDescription>{t("pricing.cards", { count: plan.cardLimit })}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6">
                <p>
                  <span className="text-3xl font-bold tracking-tight">{formatKzt(plan.monthlyPriceKzt)}</span>{" "}
                  <span className="text-muted-foreground">{t("pricing.perMonth")}</span>
                </p>
                <Button asChild variant="outline">
                  <Link href={{ pathname: "/", hash: "contact" }}>{t("pricing.choose")}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 rounded-2xl border bg-card p-6">
          <h3 className="font-semibold">{t("pricing.includedTitle")}</h3>
          <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">{t("pricing.note")}</p>
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
        <div className="mx-auto grid w-full max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <Card>
            <CardContent>
              <LeadForm />
            </CardContent>
          </Card>
          <div className="grid content-start gap-3 text-sm">
            <p className="font-medium">{t("contact.orContact")}</p>
            <a href={salesContacts.phoneHref} className="flex items-center gap-2 hover:underline">
              <Phone className="size-4 text-primary" aria-hidden="true" />
              {salesContacts.phone}
            </a>
            <a
              href={salesContacts.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:underline"
            >
              <MessageCircle className="size-4 text-primary" aria-hidden="true" />
              {t("contact.whatsapp")}
            </a>
            <a href={`mailto:${salesContacts.email}`} className="flex items-center gap-2 hover:underline">
              <Mail className="size-4 text-primary" aria-hidden="true" />
              {salesContacts.email}
            </a>
          </div>
        </div>
      </Section>
    </>
  );
}
