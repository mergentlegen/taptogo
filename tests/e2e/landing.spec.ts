import { expect, test, type Page } from "@playwright/test";

import { defaultPlatformSettings } from "@/features/platform/schemas";

import { accounts, collectConsoleErrors, signIn } from "./helpers";

// Leads are rate-limited per IP; give each test its own address so parallel runs don't collide.
async function asVisitor(page: Page) {
  const info = test.info();
  await page.setExtraHTTPHeaders({
    "x-real-ip": `198.18.${info.project.name.length}.${(info.workerIndex % 200) + 1}`,
  });
}

test.describe("landing", () => {
  test("shows how it works, the dashboard preview, plans from settings and the FAQ", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");

    for (const title of ["Три шага от касания до отзыва", "Всё видно с телефона", "Частые вопросы"]) {
      await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    }
    await expect(page.getByText("Касания по дням")).toBeVisible();

    const plans = page.getByTestId("plan");
    await expect(plans).toHaveCount(3);
    for (const [index, plan] of defaultPlatformSettings.plans.entries()) {
      const price = new Intl.NumberFormat("ru-RU").format(plan.monthlyPriceKzt);
      await expect(plans.nth(index)).toContainText(price);
    }

    const question = page.getByText("Гостю нужно что-то устанавливать?");
    await question.click();
    await expect(page.getByText(/iPhone XS и новее/)).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("robots.txt keeps cabinets and card links out of search", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    for (const path of ["/app", "/admin", "/t/"]) expect(body).toContain(`Disallow: ${path}`);
  });
});

test.describe("lead form", () => {
  test("validates, accepts a local phone format and shows up in the admin panel", async ({
    page,
    browser,
  }) => {
    await asVisitor(page);
    await page.goto("/#contact");
    const form = page.getByRole("form", { name: "Оставьте заявку" });

    await form.getByRole("button", { name: "Отправить заявку" }).click();
    await expect(form.getByLabel("Ваше имя")).toHaveAttribute("aria-invalid", "true");
    // Client-side messages come from the dictionary, not Zod's English defaults.
    await expect(form.getByText("Обязательное поле")).toHaveCount(3);

    const business = `E2E Кофейня ${test.info().project.name} ${Date.now()}`;
    await form.getByLabel("Ваше имя").fill("Алия");
    await form.getByLabel("Телефон").fill("8 (701) 555-12-34");
    await form.getByLabel("Название бизнеса").fill(business);
    await form.getByLabel("Город (необязательно)").fill("Алматы");
    await form.getByRole("button", { name: "Отправить заявку" }).click();
    await expect(page.getByTestId("lead-sent")).toContainText("Спасибо, заявка принята!");

    const admin = await browser.newPage();
    await signIn(admin, accounts.admin);
    await admin.goto("/admin/leads");
    const lead = admin.getByTestId("lead").filter({ hasText: business });
    await expect(lead).toContainText("+77015551234");
    await expect(lead).toContainText("Алматы");
    await admin.close();
  });

  test("a filled honeypot looks like success but stores nothing", async ({ page, browser }) => {
    await asVisitor(page);
    await page.goto("/#contact");
    const form = page.getByRole("form", { name: "Оставьте заявку" });
    const business = `E2E Бот ${test.info().project.name} ${Date.now()}`;
    await form.getByLabel("Ваше имя").fill("Bot");
    await form.getByLabel("Телефон").fill("+77015550000");
    await form.getByLabel("Название бизнеса").fill(business);
    await page.locator('input[name="website"]').fill("https://spam.example", { force: true });
    await form.getByRole("button", { name: "Отправить заявку" }).click();
    await expect(page.getByTestId("lead-sent")).toBeVisible();

    const admin = await browser.newPage();
    await signIn(admin, accounts.admin);
    await admin.goto("/admin/leads");
    await expect(admin.getByTestId("lead").first()).toBeVisible();
    await expect(admin.getByTestId("lead").filter({ hasText: business })).toHaveCount(0);
    await admin.close();
  });

  test("server-side validation answers in Russian too", async ({ page }) => {
    await asVisitor(page);
    await page.goto("/#contact");
    // Passes the browser check, then is tampered with on the way to the server.
    await page.route("**/", async (route) => {
      const request = route.request();
      const body = request.postData();
      if (request.method() === "POST" && request.headers()["next-action"] && body) {
        await route.continue({ postData: body.replace("+77015557788", "123") });
      } else {
        await route.continue();
      }
    });
    const form = page.getByRole("form", { name: "Оставьте заявку" });
    await form.getByLabel("Ваше имя").fill("Алия");
    await form.getByLabel("Телефон").fill("+77015557788");
    await form.getByLabel("Название бизнеса").fill("Проверка сервера");
    await form.getByRole("button", { name: "Отправить заявку" }).click();
    await expect(form.getByText("Формат: +7XXXXXXXXXX")).toBeVisible();
    await expect(page.getByTestId("lead-sent")).toHaveCount(0);
  });
});
