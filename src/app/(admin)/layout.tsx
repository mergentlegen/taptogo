import { ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/brand/logo";
import { AdminMobileNav, AdminSidebarNav } from "@/components/layout/admin-navigation";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/layout/skip-link";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { adminNavigation } from "@/config/navigation";
import { requirePlatformAccess } from "@/server/auth/session";
import { can } from "@/server/permissions";

/** Platform admin panel: desktop-first, dense, visually distinct from the client cabinet. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Pages check their own permission too; this only feeds the chrome.
  const { session, actor } = await requirePlatformAccess();
  const t = await getTranslations();
  const visible = adminNavigation
    .flatMap((g) => g.items)
    .filter((i) => can(actor, i.permission))
    .map((i) => i.key);
  const { user } = session;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[14rem_minmax(0,1fr)]">
      <SkipLink />

      <aside className="sticky top-0 hidden h-dvh flex-col gap-5 overflow-y-auto border-r bg-sidebar px-2 py-4 lg:flex">
        <Link href="/admin" aria-label={t("common.logoLabel")} className="px-3">
          <Logo />
        </Link>
        <AdminSidebarNav visible={visible} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:px-6">
          <AdminMobileNav visible={visible} />
          <span
            className="inline-flex items-center gap-1.5 rounded-md bg-warning px-2 py-0.5 text-xs font-semibold text-warning-foreground"
            data-testid="admin-badge"
          >
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {t("admin.badge")}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <Link
              href="/"
              className="hidden rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              {t("admin.backToSite")}
            </Link>
            <ThemeToggle />
            <UserMenu
              name={user.name}
              email={user.email}
              roleLabel={user.platformRole ? t(`roles.${user.platformRole}`) : ""}
            />
          </div>
        </header>

        <main id={MAIN_CONTENT_ID} className="flex-1 px-4 py-5 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
