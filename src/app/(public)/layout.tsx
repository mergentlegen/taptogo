import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/layout/skip-link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { salesContacts } from "@/config/contacts";

const sectionLinks = [
  { hash: "how-it-works", key: "howItWorks" },
  { hash: "features", key: "features" },
  { hash: "faq", key: "faq" },
] as const;

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations();

  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />

      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label={t("common.logoLabel")}>
            <Logo />
          </Link>
          <nav aria-label={t("nav.mainLabel")} className="hidden items-center gap-6 text-sm md:flex">
            {sectionLinks.map(({ hash, key }) => (
              <Link
                key={key}
                href={{ pathname: "/", hash }}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {t(`nav.public.${key}`)}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="outline">
              <Link href="/login">{t("common.signIn")}</Link>
            </Button>
            <Button asChild className="hidden sm:inline-flex">
              <Link href={{ pathname: "/", hash: "contact" }}>{t("nav.public.contact")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id={MAIN_CONTENT_ID} className="flex-1">
        {children}
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>{t("public.footer.rights", { year: new Date().getFullYear() })}</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <a
              href={salesContacts.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-foreground"
            >
              WhatsApp {salesContacts.whatsapp}
            </a>
            <Link href="/admin" className="hover:text-foreground">
              {t("public.footer.admin")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
