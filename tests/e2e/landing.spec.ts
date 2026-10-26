import { expect, test } from "@playwright/test";

import { collectConsoleErrors } from "./helpers";

const WHATSAPP = "https://wa.me/77076897325";

test.describe("landing", () => {
  test("shows how it works, the dashboard preview, what is included and the FAQ", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");

    for (const title of [
      "Три шага от касания до отзыва",
      "Всё видно с телефона",
      "Всё для сбора отзывов",
      "Частые вопросы",
    ]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    await expect(page.getByText("Касания по дням")).toBeVisible();

    const question = page.getByText("Гостю нужно что-то устанавливать?");
    await question.click();
    await expect(page.getByText(/iPhone XS и новее/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("has no prices, plans, subscription wording, fake reviews or rating figures", async ({ page }) => {
    await page.goto("/");
    const text = (await page.locator("body").innerText()).toLowerCase();

    for (const word of ["тариф", "подписк", "в месяц", "рейтинг 2гис", "новые отзывы", "конверсия"]) {
      // "без подписки" is the one honest mention: payment is one-time.
      const cleaned = text.replace("без подписки", "");
      expect(cleaned, word).not.toContain(word);
    }
    await expect(page.getByTestId("plan")).toHaveCount(0);
  });

  test("contacts are a single WhatsApp number and no form", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("form")).toHaveCount(0);
    await expect(page.getByText("+7 707 689 73 25").first()).toBeVisible();
    const links = page.locator(`a[href^="${WHATSAPP}"]`);
    expect(await links.count()).toBeGreaterThanOrEqual(2);
    for (const href of await links.evaluateAll((nodes) => nodes.map((n) => n.getAttribute("href")))) {
      expect(href).toMatch(/^https:\/\/wa\.me\/77076897325(\?text=.+)?$/);
    }
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
  });

  test("robots.txt keeps cabinets and card links out of search", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    for (const path of ["/app", "/admin", "/t/"]) expect(body).toContain(`Disallow: ${path}`);
  });
});
