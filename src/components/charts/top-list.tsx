import type { Route } from "next";
import Link from "next/link";

import { formatNumber } from "@/lib/format";

type Item = { id: string; label: string; sublabel?: string | null; value: number; href?: Route };

/** Ranked list with thin bars; the value sits as text beside each bar. */
export function TopList({ items, emptyText }: { items: Item[]; emptyText: string }) {
  if (items.length === 0)
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <ol className="grid gap-3">
      {items.map((item, index) => (
        <li key={item.id} className="grid gap-1.5">
          <div className="flex items-baseline gap-2 text-sm">
            <span className="w-4 text-muted-foreground tabular-nums">{index + 1}</span>
            <span className="min-w-0 flex-1 truncate">
              {item.href ? (
                <Link href={item.href} className="font-medium hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className="font-medium">{item.label}</span>
              )}
              {item.sublabel && <span className="text-muted-foreground"> · {item.sublabel}</span>}
            </span>
            <span className="font-medium tabular-nums">{formatNumber(item.value)}</span>
          </div>
          <div className="ml-6 h-1.5 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-chart-1"
              style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
