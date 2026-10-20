import { cn } from "@/lib/utils";

/**
 * TapToGo mark: a tap point with NFC waves radiating towards the
 * top-right, i.e. "tap, then go".
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn("size-8 shrink-0", className)}
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <g fill="none" strokeLinecap="round" strokeWidth="2.6" className="stroke-primary-foreground">
        <path d="M10 16.5a5.5 5.5 0 0 1 5.5 5.5" />
        <path d="M10 11.5a10.5 10.5 0 0 1 10.5 10.5" opacity="0.8" />
        <path d="M10 6.5A15.5 15.5 0 0 1 25.5 22" opacity="0.55" />
      </g>
      <circle cx="10" cy="22" r="2.6" className="fill-primary-foreground" />
    </svg>
  );
}

export function Logo({ className, showWordmark = true }: { className?: string; showWordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      {showWordmark && (
        <span className="text-lg font-semibold tracking-tight">
          Tap<span className="text-primary">To</span>Go
        </span>
      )}
    </span>
  );
}
