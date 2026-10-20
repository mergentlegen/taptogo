import { expect, test, type Browser, type Page } from "@playwright/test";

import { createSeedData } from "@/mocks/seed";

import { accounts, collectConsoleErrors, DEMO_PASSWORD, signIn } from "./helpers";

// Same deterministic seed as the server: ids and labels match.
const seed = createSeedData();
const orgByName = (name: string) => seed.organizations.find((o) => o.name === name)!;
const coffee = orgByName("Coffee Point");
const beauty = orgByName("Aru Beauty");
const beautyCard = seed.cards.find((c) => c.organizationId === beauty.id)!;
const beautyLocation = seed.locations.find((l) => l.organizationId === beauty.id)!;
const coffeeCard = (label: string, location: string) => {
  const loc = seed.locations.find((l) => l.organizationId === coffee.id && l.name.includes(location))!;
  return seed.cards.find((c) => c.locationId === loc.id && c.label === label)!;
};

test.describe("dashboard", () => {
  test("shows KPIs, charts and reacts to filters in the URL", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await signIn(page, accounts.owner);

    await expect(page.getByTestId("kpi-taps")).toContainText(/\d/);
    await expect(page.getByTestId("kpi-conversion")).toContainText("Конверсия ≈");
    await expect(page.getByText("Касания по дням")).toBeVisible();
    await expect(page.getByText("Когда прикладывают карточки")).toBeVisible();
    const all = await page.getByTestId("kpi-taps").locator("p").nth(1).textContent();

    await page.getByRole("radio", { name: "7 дней" }).click();
    await expect(page).toHaveURL(/period=7d/);
    await expect(page.getByTestId("kpi-taps").locator("p").nth(1)).not.toHaveText(all ?? "");
    expect(errors).toEqual([]);
  });

  test("hides statistics when the subscription expired, but nothing else", async ({ page }) => {
    await signIn(page, "owner@arubeauty.kz");
    await expect(page.getByTestId("stats-locked")).toBeVisible();
    await expect(page.getByText("Подписка истекла")).toBeVisible();
    await expect(page.getByTestId("kpi-taps")).toHaveCount(0);

    // Card management still works for an expired client.
    await page.goto("/app/cards");
    await expect(page.getByRole("link", { name: /Ресепшн/ })).toBeVisible();
    expect((await page.request.get("/app/reports/export?format=csv")).status()).toBe(403);
  });
});

test.describe("organization isolation via URL", () => {
  test("an owner of Coffee Point gets 404 for Aru Beauty's card and location", async ({ page }) => {
    await signIn(page, accounts.owner);

    expect((await page.goto(`/app/cards/${beautyCard.id}`))?.status()).toBe(404);
    expect((await page.goto(`/app/locations/${beautyLocation.id}`))?.status()).toBe(404);
    expect((await page.request.get(`/app/cards/${beautyCard.id}/qr?format=svg`)).status()).toBe(404);
  });

  test("a foreign id in dashboard filters is ignored", async ({ page }) => {
    await signIn(page, accounts.owner);
    await page.goto(`/app?card=${beautyCard.id}`);
    await expect(page.getByRole("combobox", { name: "Карточка" })).toContainText("Все");
  });

  test("reports contain only the organization's own data, whatever the query says", async ({ page }) => {
    await signIn(page, accounts.manager);
    const csv = await page.request.get(
      `/app/reports/export?format=csv&dimension=locations&period=90d&organizationId=${beauty.id}&location=${beautyLocation.id}`,
    );
    const body = await csv.text();
    expect(body).toContain("Coffee Point на Абая");
    expect(body).not.toContain(beautyLocation.name);
  });
});

/**
 * Spec section 10: "…ни через Server Action с подменённым id". The browser
 * sends a real Server Action request; we rewrite the id in flight to one of
 * another organization, exactly as an attacker with DevTools would.
 */
test.describe("organization isolation via forged Server Action ids", () => {
  const beautyEmployee = seed.employees.find((e) => e.organizationId === beauty.id)!;
  const coffeeEmployee = seed.employees.find((e) => e.organizationId === coffee.id)!;

  async function forgeActionIds(page: Page, path: string, ownId: string, foreignId: string) {
    const sent = { forged: false };
    await page.route(`**${path}`, async (route) => {
      const request = route.request();
      const body = request.postData();
      if (request.method() === "POST" && request.headers()["next-action"] && body?.includes(ownId)) {
        sent.forged = true;
        await route.continue({ postData: body.replaceAll(ownId, foreignId) });
      } else {
        await route.continue();
      }
    });
    return sent;
  }

  async function asBeautyOwner(browser: Browser) {
    const page = await browser.newPage();
    await signIn(page, "owner@arubeauty.kz");
    return page;
  }

  test("renaming another organization's card fails and changes nothing", async ({
    page,
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, "same request on mobile");
    const own = coffeeCard("Касса", "Абая");
    await signIn(page, accounts.manager);
    await page.goto(`/app/cards/${own.id}`);
    const sent = await forgeActionIds(page, `/app/cards/${own.id}`, own.id, beautyCard.id);

    await page.getByRole("button", { name: "Изменить" }).click();
    await page.getByLabel("Название").fill("Взлом");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Карточка не найдена")).toBeVisible();
    expect(sent.forged).toBe(true);

    const victim = await asBeautyOwner(browser);
    await victim.goto(`/app/cards/${beautyCard.id}`);
    await expect(victim.getByRole("heading", { level: 1 })).toHaveText(beautyCard.label);
    await victim.close();
  });

  test("deleting another organization's employee fails and changes nothing", async ({
    page,
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, "same request on mobile");
    await signIn(page, accounts.manager);
    await page.goto("/app/employees");
    const sent = await forgeActionIds(page, "/app/employees", coffeeEmployee.id, beautyEmployee.id);

    await page.getByRole("button", { name: `Удалить: ${coffeeEmployee.name}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
    await expect(page.getByText("Сотрудник не найден")).toBeVisible();
    expect(sent.forged).toBe(true);
    await page.reload();
    await expect(page.getByRole("table").getByText(coffeeEmployee.name, { exact: true })).toBeVisible();

    const victim = await asBeautyOwner(browser);
    await victim.goto("/app/employees");
    await expect(victim.getByRole("table").getByText(beautyEmployee.name, { exact: true })).toBeVisible();
    await victim.close();
  });
});

test.describe("cards", () => {
  test("can be found by printed code and opened", async ({ page }) => {
    const card = coffeeCard("Бариста Мадина", "Достык");
    await signIn(page, accounts.manager);
    await page.goto("/app/cards");
    await page.getByRole("searchbox").fill(card.code);
    // Phones get a list instead of the table; both show exactly one match.
    await expect(page.getByRole("link", { name: /Бариста Мадина/ })).toHaveCount(1);
    await expect(page.getByRole("link", { name: /Касса/ })).toHaveCount(0);
    await page.getByRole("link", { name: /Бариста Мадина/ }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Бариста Мадина" })).toBeVisible();
    await expect(page.getByRole("img", { name: "QR-код карточки" })).toBeVisible();
    const svg = await page.request.get(`/app/cards/${card.id}/qr?format=svg`);
    expect(svg.headers()["content-type"]).toContain("image/svg+xml");
  });

  test("viewers can look but not change", async ({ page }) => {
    await signIn(page, accounts.viewer);
    await page.goto(`/app/cards/${coffeeCard("Стол 1", "Абая").id}`);
    await expect(page.getByText("Изменять карточки могут владелец и менеджер.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Сообщить о потере" })).toHaveCount(0);
  });

  test("a card reported lost stops redirecting immediately", async ({ page, isMobile }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    const card = coffeeCard("Стол 3", "Абая");
    await signIn(page, accounts.owner);
    await page.goto(`/app/cards/${card.id}`);

    await page.getByRole("button", { name: "Сообщить о потере" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Да, отключить" }).click();
    await expect(page.getByText("Потеряна", { exact: true })).toBeVisible();

    const tap = await page.request.get(`/t/${card.code}`, {
      maxRedirects: 0,
      headers: { "x-real-ip": "198.20.0.1" },
    });
    expect(await tap.text()).toContain("Карточка не активна");
  });

  test("can be renamed and paused by a manager", async ({ page, isMobile }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    await signIn(page, accounts.manager);
    await page.goto(`/app/cards/${coffeeCard("Стол 2", "Достык").id}`);

    await page.getByRole("button", { name: "Изменить" }).click();
    await page.getByLabel("Название").fill("Стол у окна");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Стол у окна" })).toBeVisible();

    await page.getByRole("button", { name: "Поставить на паузу" }).click();
    await expect(page.getByText("На паузе", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Включить" }).click();
    await expect(page.getByText("Активна", { exact: true })).toBeVisible();
  });
});

test.describe("other sections", () => {
  test("employees can be added and removed", async ({ page, isMobile }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    await signIn(page, accounts.manager);
    await page.goto("/app/employees");

    await page.getByRole("button", { name: "Добавить сотрудника" }).click();
    await page.getByRole("dialog").getByLabel("Имя").fill("Эльвира Тест");
    await page.getByRole("dialog").getByLabel("Должность").fill("Бариста");
    await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByRole("table").getByText("Эльвира Тест", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Удалить: Эльвира Тест" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
    await expect(page.getByRole("table").getByText("Эльвира Тест", { exact: true })).toHaveCount(0);
  });

  test("reports preview and export a CSV without formulas leaking", async ({ page }) => {
    await signIn(page, accounts.viewer);
    await page.goto("/app/reports?dimension=locations");
    await expect(page.getByRole("cell", { name: "Итого" })).toBeVisible();

    const csv = await page.request.get("/app/reports/export?format=csv&dimension=cards&period=30d");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-disposition"]).toContain("attachment");
    const body = await csv.text();
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body).toContain("Карточка;Код;Филиал");
    const xlsx = await page.request.get("/app/reports/export?format=xlsx&dimension=days");
    expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  });

  test("the owner invites a teammate but cannot remove the last owner", async ({ page, isMobile }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    await signIn(page, accounts.owner);
    await page.goto("/app/team");

    await page.getByRole("button", { name: "Пригласить" }).click();
    await page.getByRole("dialog").getByLabel("Email").fill("new.barista@coffeepoint.kz");
    await page.getByRole("dialog").getByRole("button", { name: "Отправить приглашение" }).click();
    await expect(
      page.getByTestId("team-invitation").filter({ hasText: "new.barista@coffeepoint.kz" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Удалить из команды: Аружан Сейткали" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
    await expect(page.getByText("В организации должен остаться хотя бы один владелец")).toBeVisible();
  });

  test("support tickets are filed and listed", async ({ page, isMobile }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    await signIn(page, accounts.viewer);
    await page.goto("/app/support");
    await page.getByLabel("Тема", { exact: true }).fill("Нужен ещё один стикер");
    await page.getByLabel("Сообщение").fill("Для второго зала, пожалуйста.");
    await page.getByRole("button", { name: "Отправить" }).click();

    await expect(page.getByTestId("tickets")).toContainText("Нужен ещё один стикер");
    await expect(page.getByText("Как гость оставляет отзыв?")).toBeVisible();
  });

  test("settings reject a fake image as a logo", async ({ page, isMobile }) => {
    test.skip(isMobile, "file chooser flow is the same on mobile");
    await signIn(page, accounts.owner);
    await page.goto("/app/settings?tab=organization");
    await page.locator("#logo-input").setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    });
    await expect(page.getByText("Подходят только PNG, JPEG или WebP")).toBeVisible();
  });

  test("password change requires the current password", async ({ page, isMobile }) => {
    test.skip(isMobile, "same form on mobile");
    await signIn(page, accounts.viewer);
    await page.goto("/app/settings?tab=security");
    await page.getByLabel("Текущий пароль").fill("not-my-password");
    await page.getByLabel("Новый пароль", { exact: true }).fill("Совсем-новый-пароль-1");
    await page.getByLabel("Повторите новый пароль").fill("Совсем-новый-пароль-1");
    await page.getByRole("button", { name: "Сменить пароль" }).click();
    await expect(page.getByText("Текущий пароль указан неверно")).toBeVisible();
    expect(DEMO_PASSWORD).toBe("demo12345");
  });
});
