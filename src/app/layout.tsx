import "./globals.css";

import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { JetBrains_Mono, Onest } from "next/font/google";
import { cookies, headers } from "next/headers";

import { ValidationLocale } from "@/components/forms/validation-locale";
import { parseTheme, THEME_COOKIE, themeInitScript } from "@/components/theme/theme";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "cyrillic"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  return {
    title: { default: t("title"), template: "%s · TapToGo" },
    description: t("description"),
    applicationName: "TapToGo",
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafcfd" },
    { media: "(prefers-color-scheme: dark)", color: "#12161c" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [headerList, cookieStore, locale] = await Promise.all([headers(), cookies(), getLocale()]);
  // Set by src/proxy.ts; Next.js applies the same nonce to its own scripts.
  const nonce = headerList.get("x-nonce") ?? undefined;
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <html
      lang={locale}
      className={cn(onest.variable, jetbrainsMono.variable, theme === "dark" && "dark")}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider>
          <ValidationLocale />
          <ThemeProvider initialTheme={theme}>
            <TooltipProvider>
              {children}
              <Toaster />
            </TooltipProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
