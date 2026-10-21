import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { AppMobileNav, AppSidebarNav } from "@/components/layout/app-navigation";
import { ImpersonationBanner } from "@/components/layout/impersonation-banner";
import { OrgSwitcher } from "@/components/layout/org-switcher";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/layout/skip-link";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { appNavigation } from "@/config/navigation";
import { requireOrgAccess } from "@/server/auth/session";

/** Client cabinet: sidebar on desktop, bottom tab bar on mobile. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Pages check their own permission too; this only feeds the chrome.
  const access = await requireOrgAccess();
  const t = await getTranslations();
  const visible = appNavigation.filter((i) => access.permissions.includes(i.permission)).map((i) => i.key);
  const { user } = access.session;

  return (
    <>
      {access.session.impersonation && (
        <ImpersonationBanner
          organization={access.organization.name}
          admin={user.name}
          expiresAt={access.session.impersonation.expiresAt}
          timeZone={access.organization.timezone}
        />
      )}
      <div className="min-h-dvh md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
        <SkipLink />

        <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r bg-sidebar px-3 py-4 md:flex">
          <Link href="/app" aria-label={t("common.logoLabel")} className="px-2">
            <Logo />
          </Link>
          <AppSidebarNav visible={visible} />
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-8">
            <Link href="/app" aria-label={t("common.logoLabel")} className="md:hidden">
              <Logo showWordmark={false} />
            </Link>
            <OrgSwitcher organizations={access.organizations} activeId={access.organization.id} />
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              <UserMenu
                cabinet
                canManageTeam={access.permissions.includes("org.team.manage")}
                name={user.name}
                email={user.email}
                roleLabel={
                  access.role
                    ? t(`roles.${access.role}`)
                    : user.platformRole
                      ? t(`roles.${user.platformRole}`)
                      : ""
                }
              />
            </div>
          </header>

          <main id={MAIN_CONTENT_ID} className="flex-1 px-4 pt-6 pb-28 md:px-8 md:pb-10">
            {children}
          </main>
        </div>

        <AppMobileNav visible={visible} />
      </div>
    </>
  );
}
