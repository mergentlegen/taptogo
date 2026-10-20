"use client";

import { Ellipsis } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { SidebarLink } from "@/components/layout/nav-link";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { appMobilePrimary, appNavigation, isNavItemActive, type AppNavKey } from "@/config/navigation";
import { cn } from "@/lib/utils";

/** Menu items the current user may open; computed on the server with can(). */
type VisibleProps = { visible: readonly AppNavKey[] };

export function AppSidebarNav({ visible }: VisibleProps) {
  const t = useTranslations("nav");

  return (
    <nav aria-label={t("mainLabel")} className="flex flex-col gap-1">
      {appNavigation
        .filter((item) => visible.includes(item.key))
        .map((item) => (
          <SidebarLink key={item.key} href={item.href} icon={item.icon} label={t(`app.${item.key}`)} />
        ))}
    </nav>
  );
}

const tabClass =
  "flex flex-1 flex-col items-center justify-center gap-1 rounded-lg py-2 text-[0.6875rem] font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Mobile bottom bar: the most used sections plus a "More" sheet with the rest. */
export function AppMobileNav({ visible }: VisibleProps) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const items = appNavigation.filter((item) => visible.includes(item.key));
  const primary = items.filter((item) => appMobilePrimary.includes(item.key));
  const secondary = items.filter((item) => !appMobilePrimary.includes(item.key));
  const secondaryActive = secondary.some((item) => isNavItemActive(pathname, item.href));

  return (
    <nav
      aria-label={t("mobileLabel")}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <div className="mx-auto flex max-w-lg gap-1 px-2">
        {primary.map(({ key, href, icon: Icon }) => {
          const active = isNavItemActive(pathname, href);
          return (
            <Link
              key={key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(tabClass, active && "text-primary")}
            >
              <Icon className="size-5" aria-hidden="true" />
              {t(`app.${key}`)}
            </Link>
          );
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger className={cn(tabClass, secondaryActive && "text-primary")}>
            <Ellipsis className="size-5" aria-hidden="true" />
            {t("more")}
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <SheetHeader>
              <SheetTitle>{t("moreTitle")}</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-1 px-4">
              {secondary.map((item) => (
                <SidebarLink
                  key={item.key}
                  href={item.href}
                  icon={item.icon}
                  label={t(`app.${item.key}`)}
                  onNavigate={() => setMoreOpen(false)}
                />
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
