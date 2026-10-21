"use client";

import { Loader2, X } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { periodPresets, type PeriodPreset } from "@/lib/period";

type Option = { id: string; name: string };
type FilterKey = "location" | "employee" | "card";

const ALL = "all";

/**
 * One row of filters above everything they scope. All state lives in the URL
 * (?period=&from=&to=&location=&employee=&card=) so a view can be shared.
 * While the server re-renders, the current page stays visible (transition).
 */
export function PeriodFilter({
  period,
  from,
  to,
  today,
  filters,
}: {
  period: PeriodPreset;
  from: string;
  to: string;
  today: string;
  filters?: {
    key: FilterKey;
    label: string;
    value?: string;
    options: Option[];
  }[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState({ from, to });
  const [showCustom, setShowCustom] = useState(period === "custom");

  const navigate = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const query = params.toString();
    startTransition(() =>
      router.replace((query ? `${pathname}?${query}` : pathname) as Route, {
        scroll: false,
      }),
    );
  };

  const hasFilters = filters?.some((f) => f.value);

  return (
    <div className="flex flex-wrap items-center gap-2" aria-busy={pending}>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={showCustom ? "custom" : period}
        onValueChange={(value) => {
          if (!value) return;
          if (value === "custom") {
            setShowCustom(true);
            return;
          }
          setShowCustom(false);
          navigate({ period: value, from: null, to: null });
        }}
        aria-label={t("periods.label")}
        className="flex-wrap"
      >
        {periodPresets
          .filter((p) => p === "7d" || p === "30d" || p === "custom" || p === period)
          .map((preset) => (
            <ToggleGroupItem key={preset} value={preset} className="px-3">
              {t(`periods.${preset}`)}
            </ToggleGroupItem>
          ))}
      </ToggleGroup>

      {showCustom && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            navigate({ period: "custom", from: custom.from, to: custom.to });
          }}
        >
          <Input
            type="date"
            value={custom.from}
            max={custom.to}
            onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
            aria-label={t("periods.from")}
            className="h-8 w-auto"
          />
          <Input
            type="date"
            value={custom.to}
            min={custom.from}
            max={today}
            onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
            aria-label={t("periods.to")}
            className="h-8 w-auto"
          />
          <Button type="submit" size="sm" variant="secondary">
            {t("periods.apply")}
          </Button>
        </form>
      )}

      {filters?.map((filter) =>
        filter.options.length > 1 || filter.value ? (
          <Select
            key={filter.key}
            value={filter.value ?? ALL}
            onValueChange={(value) => navigate({ [filter.key]: value === ALL ? null : value })}
          >
            <SelectTrigger size="sm" className="max-w-52 min-w-36" aria-label={filter.label}>
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {filter.label}: {t("filters.all")}
              </SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null,
      )}

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ location: null, employee: null, card: null })}
        >
          <X data-icon="inline-start" />
          {t("filters.reset")}
        </Button>
      )}

      {pending && (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" role="status">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          {t("filters.updating")}
        </span>
      )}
    </div>
  );
}
