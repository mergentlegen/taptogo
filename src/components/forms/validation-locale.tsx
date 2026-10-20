"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { configureValidationMessages } from "@/lib/validation-messages";

/** Browser side of the validation messages: client-side form errors in the active locale. */
export function ValidationLocale() {
  const t = useTranslations("validation");
  useEffect(() => {
    configureValidationMessages((key, values) => t(key, values));
  }, [t]);
  return null;
}
