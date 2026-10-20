// Unit tests see the same Russian validation messages as users do.
import { createTranslator } from "next-intl";

import messages from "@/i18n/messages/ru.json";
import { configureValidationMessages } from "@/lib/validation-messages";

const t = createTranslator({ locale: "ru", messages, namespace: "validation" });
configureValidationMessages((key, values) => t(key, values));
