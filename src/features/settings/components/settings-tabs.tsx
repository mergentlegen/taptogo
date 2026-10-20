"use client";

import type { Route } from "next";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { settingsTabs, type SettingsTab } from "../tabs";

/** Tabs whose selection is kept in ?tab= so each section has a shareable link. */
export function SettingsTabs({
  initial,
  panels,
}: {
  initial: SettingsTab;
  panels: Record<SettingsTab, ReactNode>;
}) {
  const t = useTranslations("settings.tabs");
  const router = useRouter();
  const pathname = usePathname();

  return (
    <Tabs
      defaultValue={initial}
      onValueChange={(tab) => router.replace(`${pathname}?tab=${tab}` as Route, { scroll: false })}
    >
      <TabsList className="mb-4 h-auto flex-wrap">
        {settingsTabs.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {t(tab)}
          </TabsTrigger>
        ))}
      </TabsList>
      {settingsTabs.map((tab) => (
        <TabsContent key={tab} value={tab}>
          {panels[tab]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
