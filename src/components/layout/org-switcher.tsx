"use client";

import { Check, ChevronsUpDown, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchOrganizationAction } from "@/features/organizations/actions";
import type { OrgRole } from "@/features/team/schemas";

type Organization = { id: string; name: string; role: OrgRole | null };

/**
 * Active organization picker. The choice is stored in a cookie by the server,
 * which accepts only organizations the user is a member of.
 */
export function OrgSwitcher({
  organizations,
  activeId,
}: {
  organizations: Organization[];
  activeId: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const active = organizations.find((o) => o.id === activeId);

  const label = (
    <>
      <Store className="size-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="truncate font-medium">{active?.name}</span>
    </>
  );

  if (organizations.length < 2) {
    return (
      <div
        className="flex min-w-0 items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-sm"
        data-testid="org-switcher"
      >
        {label}
      </div>
    );
  }

  const switchTo = (organizationId: string) =>
    startTransition(async () => {
      const result = await switchOrganizationAction({ organizationId });
      if (result.ok) router.refresh();
      else toast.error(result.error.message);
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-9 min-w-0 justify-start gap-2 px-2.5"
          disabled={pending}
          aria-label={t("app.orgSwitcher.switchTo")}
          data-testid="org-switcher"
        >
          {label}
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-60">
        <DropdownMenuLabel>{t("app.orgSwitcher.label")}</DropdownMenuLabel>
        {organizations.map((org) => (
          <DropdownMenuItem key={org.id} onSelect={() => org.id !== activeId && switchTo(org.id)}>
            <Store aria-hidden="true" />
            <span className="flex-1 truncate">{org.name}</span>
            {org.role && <span className="text-xs text-muted-foreground">{t(`roles.${org.role}`)}</span>}
            {org.id === activeId && <Check aria-label={t("app.orgSwitcher.current")} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
