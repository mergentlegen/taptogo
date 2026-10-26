"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * A read-only value with a copy button: invitation links and temporary passwords that a
 * person hands over by hand (there is no mail service). Clipboard access can be refused
 * by the browser; the text stays selectable then.
 */
export function CopyField({
  label,
  value,
  testId,
  multiline = false,
}: {
  label: string;
  value: string;
  testId?: string;
  multiline?: boolean;
}) {
  const t = useTranslations("adm.common");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The value is selectable below; copying by hand still works.
    }
  };

  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-start gap-2">
        <code
          data-testid={testId}
          className={
            multiline
              ? "min-w-0 flex-1 rounded-lg bg-muted p-3 font-mono text-sm break-words whitespace-pre-wrap select-all"
              : "min-w-0 flex-1 rounded-lg bg-muted p-3 font-mono text-sm break-all select-all"
          }
        >
          {value}
        </code>
        <Button type="button" variant="outline" onClick={copy} aria-live="polite">
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
    </div>
  );
}
