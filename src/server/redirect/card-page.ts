import { createTranslator } from "next-intl";

import { defaultLocale } from "@/i18n/config";
import messages from "@/i18n/messages/ru.json";

export type CardPageKind = "NOT_FOUND" | "NOT_ACTIVATED" | "INACTIVE" | "RATE_LIMITED" | "UNAVAILABLE";

const t = createTranslator({ locale: defaultLocale, messages, namespace: "cardPage" });

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

const LOGO = `<svg viewBox="0 0 32 32" width="48" height="48" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#0f7f7a"/><g fill="none" stroke="#f4fbfa" stroke-linecap="round" stroke-width="2.6"><path d="M10 16.5a5.5 5.5 0 0 1 5.5 5.5"/><path d="M10 11.5a10.5 10.5 0 0 1 10.5 10.5" opacity=".8"/><path d="M10 6.5A15.5 15.5 0 0 1 25.5 22" opacity=".55"/></g><circle cx="10" cy="22" r="2.6" fill="#f4fbfa"/></svg>`;

/**
 * Self-contained page shown to a guest instead of a redirect. No scripts, no
 * external assets, no data about the client business — just a neutral message.
 */
export function renderCardPage(kind: CardPageKind): string {
  const title = escapeHtml(t(`${kind}.title`));
  const text = escapeHtml(t(`${kind}.text`));
  const footer = escapeHtml(t("footer"));

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<style>
:root{color-scheme:light dark;--bg:#f6f9fa;--card:#fff;--fg:#1d2733;--muted:#5d6b7a;--border:#e1e8ec}
@media (prefers-color-scheme:dark){:root{--bg:#12161c;--card:#1a2028;--fg:#eef3f5;--muted:#a3b0bc;--border:#2a323c}}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:420px;width:100%;text-align:center;background:var(--card);border:1px solid var(--border);border-radius:20px;padding:32px 24px}
h1{font-size:22px;line-height:1.3;margin:16px 0 8px}
p{margin:0;color:var(--muted)}
footer{margin-top:24px;font-size:13px;color:var(--muted)}
</style>
</head>
<body>
<main>
${LOGO}
<h1>${title}</h1>
<p>${text}</p>
<footer>${footer}</footer>
</main>
</body>
</html>`;
}
