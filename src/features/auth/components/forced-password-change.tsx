"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";

import { PasswordForm } from "@/features/settings/components/profile-forms";

/** After the new password is saved the person continues to their home page. */
export function ForcedPasswordChange({ next }: { next: Route }) {
  const router = useRouter();
  return <PasswordForm onSaved={() => router.replace(next)} />;
}
