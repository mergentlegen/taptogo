import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  /** Formatted change vs the previous period; null when there is nothing to compare with. */
  change?: { text: string; direction: "up" | "down" | "flat" } | null;
  changeCaption?: string;
  hint?: string;
  testId?: string;
};

/**
 * KPI tile. Direction is shown by an arrow and a sign, not by color alone;
 * for every KPI here "up" is the good direction.
 */
export function StatCard({ label, value, change, changeCaption, hint, testId }: StatCardProps) {
  const Icon =
    change?.direction === "up" ? ArrowUpRight : change?.direction === "down" ? ArrowDownRight : Minus;

  return (
    <Card className="gap-2 py-4" data-testid={testId}>
      <CardContent className="grid gap-1 px-4">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>{label}</span>
          {hint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="rounded-full text-muted-foreground/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  aria-label={hint}
                >
                  <Info className="size-3.5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-balance">{hint}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        {change !== undefined && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {change ? (
              <>
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-medium",
                    change.direction === "up" && "text-success",
                    change.direction === "down" && "text-destructive",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {change.text}
                </span>
                {changeCaption}
              </>
            ) : (
              changeCaption
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
