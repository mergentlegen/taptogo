"use client";

import { Copy, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { issueTemporaryPasswordAction } from "../actions";

/**
 * Issues a temporary password to a client member. The password is shown once:
 * closing the dialog forgets it, the server keeps only the hash.
 */
export function TemporaryPasswordButton({
  organizationId,
  userId,
  name,
}: {
  organizationId: string;
  userId: string;
  name: string;
}) {
  const t = useTranslations("adm");
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState<string | null>(null);

  const issue = () =>
    startTransition(async () => {
      const result = await issueTemporaryPasswordAction({ organizationId, userId });
      if (result.ok) setPassword(result.data.password);
      else toast.error(result.error.message);
    });

  return (
    <>
      <Button size="sm" variant="outline" disabled={pending} onClick={issue}>
        <KeyRound data-icon="inline-start" />
        {t("members.issue")}
      </Button>
      <Dialog open={password !== null} onOpenChange={(open) => !open && setPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("members.title", { name })}</DialogTitle>
            <DialogDescription>{t("members.text")}</DialogDescription>
          </DialogHeader>
          <code
            className="rounded-lg bg-muted p-3 font-mono text-base break-all"
            data-testid="temporary-password"
          >
            {password}
          </code>
          <DialogFooter>
            <Button variant="outline" onClick={() => password && navigator.clipboard.writeText(password)}>
              <Copy data-icon="inline-start" />
              {t("common.copy")}
            </Button>
            <Button onClick={() => setPassword(null)}>{t("members.done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
