"use client";

import { Laptop, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { detectDeviceType, detectOperatingSystem } from "@/features/analytics/user-agent";
import { formatDateTime } from "@/lib/format";

import { revokeSessionAction } from "../actions";

type SessionRow = { id: string; lastSeenAt: string; userAgent: string | null; current: boolean };

const OS_LABEL = {
  IOS: "iPhone / iPad",
  ANDROID: "Android",
  WINDOWS: "Windows",
  MACOS: "macOS",
  LINUX: "Linux",
} as const;

function browserOf(userAgent: string, yandex: string): string | null {
  if (/edg\//i.test(userAgent)) return "Edge";
  if (/yabrowser/i.test(userAgent)) return yandex;
  if (/chrome\//i.test(userAgent)) return "Chrome";
  if (/firefox\//i.test(userAgent)) return "Firefox";
  if (/safari\//i.test(userAgent)) return "Safari";
  return null;
}

export function SessionsList({ sessions, timeZone }: { sessions: SessionRow[]; timeZone: string }) {
  const t = useTranslations("settings.sessions");
  const [pending, startTransition] = useTransition();

  return (
    <ul className="divide-y rounded-xl border">
      {sessions.map((session) => {
        const os = detectOperatingSystem(session.userAgent);
        const mobile = ["MOBILE", "TABLET"].includes(detectDeviceType(session.userAgent));
        const Icon = mobile ? Smartphone : Laptop;
        const device = session.userAgent
          ? [os === "OTHER" ? null : OS_LABEL[os], browserOf(session.userAgent, t("yandexBrowser"))]
              .filter(Boolean)
              .join(" · ")
          : "";
        return (
          <li key={session.id} className="flex items-center gap-3 p-4">
            <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{device || t("unknownDevice")}</p>
              <p className="text-sm text-muted-foreground">
                {t("lastSeen", { date: formatDateTime(session.lastSeenAt, timeZone) })}
              </p>
            </div>
            {session.current ? (
              <Badge variant="secondary">{t("current")}</Badge>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await revokeSessionAction({ sessionId: session.id });
                    if (result.ok) toast.success(t("revoked"));
                    else toast.error(result.error.message);
                  })
                }
              >
                {t("revoke")}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
