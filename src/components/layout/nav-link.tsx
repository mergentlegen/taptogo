"use client";

import type { LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavItemActive } from "@/config/navigation";
import { cn } from "@/lib/utils";

type SidebarLinkProps = {
  href: Route;
  icon: LucideIcon;
  label: string;
  dense?: boolean;
  onNavigate?: () => void;
};

export function SidebarLink({ href, icon: Icon, label, dense = false, onNavigate }: SidebarLinkProps) {
  const pathname = usePathname();
  const active = isNavItemActive(pathname, href);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 font-medium text-sidebar-foreground/75 transition-colors outline-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        dense ? "py-1.5 text-[0.8125rem]" : "py-2 text-sm",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}
