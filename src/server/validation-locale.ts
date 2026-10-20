import "server-only";

import { createTranslator } from "next-intl";

import { defaultLocale } from "@/i18n/config";
import messages from "@/i18n/messages/ru.json";
import { configureValidationMessages } from "@/lib/validation-messages";

/**
 * Server side of the validation messages (field errors returned by Server
 * Actions). Imported for its side effect by server/actions.ts.
 * With a second locale, pick the translator per request instead.
 */
const t = createTranslator({ locale: defaultLocale, messages, namespace: "validation" });
configureValidationMessages((key, values) => t(key, values));
