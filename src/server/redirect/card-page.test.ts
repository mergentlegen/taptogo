import { describe, expect, it } from "vitest";

import { renderCardPage } from "./card-page";

describe("renderCardPage", () => {
  it.each([
    ["NOT_FOUND", "Ссылка не найдена"],
    ["NOT_ACTIVATED", "Карточка ещё не активирована"],
    ["INACTIVE", "Карточка не активна"],
    ["RATE_LIMITED", "Слишком много запросов"],
    ["UNAVAILABLE", "Сервис временно недоступен"],
  ] as const)("renders %s", (kind, title) => {
    const html = renderCardPage(kind);
    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html).toContain('<html lang="ru">');
  });

  it("contains no scripts, links or external resources", () => {
    for (const kind of ["NOT_FOUND", "INACTIVE"] as const) {
      const html = renderCardPage(kind);
      expect(html).not.toMatch(/<script|<link|<a\s|src=|https?:\/\//i);
    }
  });
});
