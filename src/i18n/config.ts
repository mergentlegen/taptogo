/**
 * Supported interface languages. Adding Kazakh later:
 *   1. add "kk" here,
 *   2. create messages/kk.json with the same keys as ru.json,
 *   3. pick the locale in request.ts (cookie or user profile).
 */
export const locales = ["ru"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ru";
export const defaultTimeZone = "Asia/Almaty";
