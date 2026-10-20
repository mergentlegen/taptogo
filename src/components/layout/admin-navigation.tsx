"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { SidebarLink } from "@/components/layout/nav-link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { adminNavigation, type AdminNavKey } from "@/config/navigation";

type VisibleProps = { visible: readonly AdminNavKey[] };

function AdminNavList({ visible, onNavigate }: VisibleProps & { onNavigate?: () => void }) {
  const t = useTranslations("nav");

  return (
    <nav aria-label={t("mainLabel")} className="flex flex-col gap-4">
      {adminNavigation
        .map(({ group, items }) => ({ group, items: items.filter((item) => visible.includes(item.key)) }))
        .filter(({ items }) => items.length > 0)
        .map(({ group, items }) => (
          <div key={group} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
              {t(`adminGroups.${group}`)}
            </p>
            {items.map((item) => (
              <SidebarLink
                key={item.key}
                href={item.href}
                icon={item.icon}
                label={t(`admin.${item.key}`)}
                dense
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
    </nav>
  );
}

export function AdminSidebarNav({ visible }: VisibleProps) {
  return <AdminNavList visible={visible} />;
}

/** The admin panel is desktop-first; on narrow screens the sidebar moves into a sheet. */
export function AdminMobileNav({ visible }: VisibleProps) {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("moreTitle")}>
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{t("moreTitle")}</SheetTitle>
        </SheetHeader>
        <div className="px-3 pb-4">
          <AdminNavList visible={visible} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
