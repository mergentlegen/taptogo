"use client";

import "./globals.css";

import { ErrorScreen } from "@/components/errors/error-screen";
import { Button } from "@/components/ui/button";

/**
 * Last-resort boundary that replaces the root layout, so the i18n provider is
 * not available here. Strings are inlined on purpose; keep them in sync with
 * `errors.server` in the message files.
 */
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ru">
      <body className="antialiased">
        <title>Что-то пошло не так · TapToGo</title>
        <ErrorScreen
          code="500"
          title="Что-то пошло не так"
          description="Мы уже знаем об ошибке. Попробуйте обновить страницу."
        >
          <Button size="lg" onClick={() => retry()}>
            Попробовать снова
          </Button>
        </ErrorScreen>
      </body>
    </html>
  );
}
