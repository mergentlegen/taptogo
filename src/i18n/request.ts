import { getRequestConfig } from "next-intl/server";

import { defaultLocale, defaultTimeZone } from "./config";

export default getRequestConfig(async () => {
  // Single language for now; locale negotiation arrives together with "kk".
  const locale = defaultLocale;

  return {
    locale,
    timeZone: defaultTimeZone,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
