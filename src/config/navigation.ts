import {
  Boxes,
  Building,
  FileChartColumn,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  MapPin,
  Nfc,
  Plug,
  ScrollText,
  Send,
  Settings,
  UserCog,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import type { Messages } from "next-intl";

import { features } from "@/config/features";
import type { OrgPermission, PlatformPermission } from "@/server/permissions";

export type AppNavKey = keyof Messages["nav"]["app"];
export type AdminNavKey = keyof Messages["nav"]["admin"];
export type AdminNavGroupKey = keyof Messages["nav"]["adminGroups"];

export type NavItem<Key extends string, P extends string> = {
  key: Key;
  href: Route;
  icon: LucideIcon;
  /** Shown in the menu only with this permission; the page enforces the same one. */
  permission: P;
};

export type AppNavItem = NavItem<AppNavKey, OrgPermission>;
export type AdminNavItem = NavItem<AdminNavKey, PlatformPermission>;

export const appNavigation: AppNavItem[] = [
  { key: "dashboard", href: "/app", icon: LayoutDashboard, permission: "org.view" },
  { key: "cards", href: "/app/cards", icon: Nfc, permission: "org.view" },
  { key: "locations", href: "/app/locations", icon: MapPin, permission: "org.view" },
  { key: "employees", href: "/app/employees", icon: Users, permission: "org.view" },
  { key: "reports", href: "/app/reports", icon: FileChartColumn, permission: "org.view" },
  { key: "team", href: "/app/team", icon: UsersRound, permission: "org.team.manage" },
  { key: "settings", href: "/app/settings", icon: Settings, permission: "org.view" },
  { key: "support", href: "/app/support", icon: LifeBuoy, permission: "org.view" },
];

/** Shown in the mobile bottom bar; everything else goes under "More". */
export const appMobilePrimary: AppNavKey[] = ["dashboard", "cards", "locations", "reports"];

export const adminNavigation: { group: AdminNavGroupKey; items: AdminNavItem[] }[] = [
  {
    group: "clients",
    items: [
      { key: "overview", href: "/admin", icon: Gauge, permission: "admin.access" },
      { key: "organizations", href: "/admin/organizations", icon: Building, permission: "admin.access" },
    ],
  },
  {
    group: "cards",
    items: [
      { key: "cards", href: "/admin/cards", icon: Nfc, permission: "admin.access" },
      { key: "batches", href: "/admin/batches", icon: Boxes, permission: "admin.access" },
      { key: "targets", href: "/admin/targets", icon: Link2, permission: "admin.access" },
    ],
  },
  {
    group: "inbox",
    items: [
      { key: "support", href: "/admin/support", icon: LifeBuoy, permission: "admin.access" },
      { key: "outbox", href: "/admin/outbox", icon: Send, permission: "admin.manage" },
    ],
  },
  {
    group: "system",
    items: [
      ...(features.twogisApi
        ? [
            {
              key: "integrations" as const,
              href: "/admin/integrations" as const,
              icon: Plug,
              permission: "admin.access" as const,
            },
          ]
        : []),
      { key: "staff", href: "/admin/staff", icon: UserCog, permission: "admin.staff.manage" },
      { key: "audit", href: "/admin/audit", icon: ScrollText, permission: "admin.access" },
      { key: "settings", href: "/admin/settings", icon: Settings, permission: "admin.settings.manage" },
    ],
  },
];

export function findAppNavItem(key: AppNavKey): AppNavItem {
  const item = appNavigation.find((i) => i.key === key);
  if (!item) throw new Error(`Unknown app section ${key}`);
  return item;
}

export function findAdminNavItem(key: AdminNavKey): AdminNavItem {
  const item = adminNavigation.flatMap((g) => g.items).find((i) => i.key === key);
  if (!item) throw new Error(`Unknown admin section ${key}`);
  return item;
}

/** Section roots match only exactly; other items also match their sub-pages. */
export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/app" || href === "/admin") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
