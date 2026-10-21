"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SidebarLink } from "@/components/layout/nav-link";
import { appNavigation, isNavItemActive, type AppNavKey } from "@/config/navigation";
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
  return (
    <nav
      aria-label={t("mobileLabel")}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="mx-auto flex max-w-lg gap-1 px-2">
        {appNavigation
          .filter((i) => visible.includes(i.key))
          .map(({ key, href, icon: Icon }) => (
            <Link
              key={key}
              href={href}
              aria-current={isNavItemActive(pathname, href) ? "page" : undefined}
              className={cn(tabClass, "min-h-14", isNavItemActive(pathname, href) && "text-primary")}
            >
              <Icon className="size-5" aria-hidden="true" />
              {t(`app.${key}`)}
            </Link>
          ))}
      </div>
    </nav>
  );
}
