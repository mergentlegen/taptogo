import { expect, test } from "@playwright/test";

import { createSeedData } from "@/mocks/seed";

import { accounts, collectConsoleErrors, signIn } from "./helpers";

const seed = createSeedData();
const coffee = seed.organizations.find((o) => o.name === "Coffee Point")!;

test.describe("admin pages", () => {
  test("every section renders without console errors", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await signIn(page, accounts.admin);
    for (const path of [
      "/admin",
      "/admin/organizations",
      "/admin/organizations/new",
      `/admin/organizations/${coffee.id}`,
      "/admin/cards",
      "/admin/batches",
      "/admin/targets",
      "/admin/outbox",
      // "/admin/integrations" is hidden while features.twogisApi is off (404 by design)
      "/admin/support",
      "/admin/staff",
      "/admin/audit",
      "/admin/settings",
    ] as const) {
      expect((await page.goto(path))?.status(), path).toBe(200);
      await expect(page.locator("h1")).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
});

test.describe("clients", () => {
  test("the wizard creates a client with a location and the owner's account", async ({ page, isMobile }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    await signIn(page, accounts.admin);
    await page.goto("/admin/organizations/new");
    const name = `E2E Кофейня ${Date.now()}`;
    const ownerEmail = `owner-${Date.now()}@example.kz`;

    // Step 1 validates before moving on; the title alone is enough.
    await page.getByRole("button", { name: "Далее" }).click();
    const currentStep = page.locator('[aria-current="step"]');
    await expect(currentStep).toHaveText(/Организация/);
    await expect(page.getByLabel("БИН")).toHaveCount(0);
    await expect(page.getByLabel("Юридическое название")).toHaveCount(0);

    await page.getByLabel("Название", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Далее" }).click();

    await page.getByLabel("Название филиала").fill(`${name} на Абая`);
    await page.getByLabel("Адрес").fill("Алматы, Абая 1");
    await page.getByRole("button", { name: "Далее" }).click();

    await expect(currentStep).toHaveText(/Владелец/);
    await page.getByLabel("Имя владельца").fill("Алия Владелец");
    await page.getByLabel("Email владельца").fill(ownerEmail);
    await expect(page.getByLabel("Тариф")).toHaveCount(0);
    await page.getByRole("button", { name: "Создать клиента" }).click();

    // The temporary password is shown once, with a ready message for WhatsApp.
    const password = (await page.getByTestId("temporary-password").textContent())!;
    expect(password).toMatch(/^[A-Za-z0-9]{12}$/);
    await expect(page.getByTestId("account-credentials")).toContainText(ownerEmail);
    await page.getByRole("button", { name: "Открыть клиента" }).click();
    await expect(page).toHaveURL(/\/admin\/organizations\/[^/]+$/);
    await expect(page.getByRole("heading", { name })).toBeVisible();

    await page.getByRole("link", { name: "Филиалы", exact: true }).last().click();
    await expect(page.getByText(`${name} на Абая`)).toBeVisible();

    // The owner can sign in with it right away, and must choose their own password first.
    const owner = await page.context().browser()!.newPage();
    await owner.goto("/login");
    await owner.getByLabel("Email").fill(ownerEmail);
    await owner.getByLabel("Пароль").fill(password);
    await owner.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(owner).toHaveURL(/\/change-password$/);
    await owner.close();
  });

  test("staff can open a client's cabinet read-only and leave it", async ({ page, isMobile }) => {
    test.skip(isMobile, "same flow on mobile");
    await signIn(page, accounts.admin);
    await page.goto(`/admin/organizations/${coffee.id}`);
    await page.getByRole("button", { name: "Открыть кабинет (только чтение)" }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId("impersonation-banner")).toContainText("только чтение");
    await expect(page.getByTestId("impersonation-banner")).toContainText("Coffee Point");
    // Read-only: management sections are closed even though staff opened the cabinet.
    expect((await page.goto("/app/team"))?.status()).toBe(403);
    const card = seed.cards.find((c) => c.organizationId === coffee.id)!;
    await page.goto(`/app/cards/${card.id}`);
    await expect(page.getByText("Изменять карточки могут владелец и менеджер.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Сообщить о потере" })).toHaveCount(0);
    // Even personal "org.view" mutations are rejected on the server.
    await page.goto("/app/settings");
    await page.getByLabel("Имя", { exact: true }).fill("Подмена");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("только для просмотра")).toBeVisible();

    await page.goto("/app");
    await page.getByRole("button", { name: "Выйти из кабинета" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/organizations/${coffee.id}$`));
    await expect(page.getByTestId("impersonation-banner")).toHaveCount(0);
  });
});

test.describe("cards", () => {
  test("a new batch is exported, then assigned to a client by codes", async ({ page, isMobile }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    await signIn(page, accounts.admin);
    await page.goto("/admin/batches");
    const name = `E2E партия ${Date.now()}`;

    await page.getByRole("button", { name: "Новая партия" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Название").fill(name);
    await dialog.getByLabel("Количество").fill("3");
    await dialog.getByRole("button", { name: "Создать" }).click();

    // Lands on the flashing page with the new codes.
    await expect(page.getByRole("heading", { name: `Прошивка: ${name}` })).toBeVisible();
    const rows = page.getByTestId("flash-row");
    await expect(rows).toHaveCount(3);
    const codes = await rows.locator("p.font-mono.text-sm").allTextContents();
    expect(codes).toHaveLength(3);

    // Only the QR archive for the print shop is offered; the CSV export is gone.
    const batchId = page.url().split("/").at(-1)!;
    await expect(page.getByRole("link", { name: "CSV для производства" })).toHaveCount(0);
    const zip = await page.request.get(`/admin/batches/${batchId}/export`);
    expect(zip.status()).toBe(200);
    expect(zip.headers()["content-type"]).toContain("application/zip");

    await page.goto("/admin/cards");
    await page.getByRole("button", { name: "Назначить клиенту" }).click();
    const assign = page.getByRole("dialog");
    await assign.getByLabel("Коды карточек").fill(codes.join("\n"));
    await assign.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "AquaDrive" }).click();
    await assign.getByRole("button", { name: "Назначить клиенту" }).click();
    await expect(page.getByText("Назначено карточек: 3")).toBeVisible();

    // Search runs on the server (the platform may hold more cards than a page): submit it.
    await page.getByPlaceholder("Код карточки").fill(codes[0]!);
    await page.getByPlaceholder("Код карточки").press("Enter");
    await expect(page).toHaveURL(new RegExp(`search=${codes[0]}`));
    await expect(page.getByRole("row")).toHaveCount(2); // header + the one match
    const row = page.getByRole("row").filter({ hasText: codes[0]! });
    await expect(row).toContainText("AquaDrive");
    await expect(row).toContainText("Активна");

    // Filters live in the URL too and are validated on the server.
    await page.goto("/admin/cards?status=UNASSIGNED&batch=not-a-uuid");
    await expect(page.getByRole("row").filter({ hasText: "Активна" })).toHaveCount(0);
  });
});

test.describe("batches", () => {
  test("a batch can be renamed, and deleted only while nothing was handed out", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    await signIn(page, accounts.admin);
    await page.goto("/admin/batches");
    const name = `E2E лишняя ${Date.now()}`;
    const renamed = `${name} (переименована)`;

    await page.getByRole("button", { name: "Новая партия" }).click();
    await page.getByRole("dialog").getByLabel("Название").fill(name);
    await page.getByRole("dialog").getByLabel("Количество").fill("2");
    await page.getByRole("dialog").getByRole("button", { name: "Создать" }).click();
    await expect(page.getByRole("heading", { name: `Прошивка: ${name}` })).toBeVisible();

    await page.goto("/admin/batches");
    const row = page.getByRole("row").filter({ hasText: name });
    await row.getByRole("button", { name: "Изменить" }).click();
    await page.getByRole("dialog").getByLabel("Название").fill(renamed);
    await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Партия сохранена")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: renamed })).toBeVisible();

    await page.getByRole("row").filter({ hasText: renamed }).getByRole("button", { name: "Удалить" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
    await expect(page.getByText("Партия удалена")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: renamed })).toHaveCount(0);
  });

  test("a batch with cards given to a client cannot be deleted", async ({ page, isMobile }) => {
    test.skip(isMobile, "same flow on mobile");
    await signIn(page, accounts.admin);
    await page.goto("/admin/batches");
    // Every seeded batch has handed-out cards.
    const row = page.getByRole("row").nth(1);
    await row.getByRole("button", { name: "Удалить" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Удалить" }).click();
    await expect(page.getByText(/выданные клиентам или с историей касаний/)).toBeVisible();
    await expect(page.getByRole("row")).not.toHaveCount(1);
  });
});

test.describe("client accounts", () => {
  test("an admin creates an account for a client's employee and hands over the password", async ({
    page,
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    await signIn(page, accounts.admin);
    await page.goto(`/admin/organizations/${coffee.id}?tab=users`);
    const email = `account-${Date.now()}@example.kz`;

    await page.getByRole("button", { name: "Создать аккаунт" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Имя").fill("Новый Сотрудник");
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByRole("button", { name: "Создать", exact: true }).click();
    const password = (await dialog.getByTestId("temporary-password").textContent())!;
    expect(password).toMatch(/^[A-Za-z0-9]{12}$/);
    await dialog.getByRole("button", { name: "Готово" }).click();
    await expect(page.getByRole("cell", { name: /Новый Сотрудник/ })).toBeVisible();

    const person = await browser.newPage();
    await person.goto("/login");
    await person.getByLabel("Email").fill(email);
    await person.getByLabel("Пароль").fill(password);
    await person.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(person).toHaveURL(/\/change-password$/);
    await person.close();
  });
});

test.describe("client invitations", () => {
  test("an admin gets an invitation link to copy, and it works once", async ({ page, browser, isMobile }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    await signIn(page, accounts.admin);
    await page.goto(`/admin/organizations/${coffee.id}?tab=users`);
    const email = `reinvite-${Date.now()}@example.kz`;

    await page.getByRole("button", { name: "Пригласить" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByRole("button", { name: "Создать ссылку" }).click();
    const link = (await dialog.getByTestId("invitation-link").textContent())!;
    expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]+$/);
    await dialog.getByRole("button", { name: "Готово" }).click();
    await expect(page.getByRole("cell", { name: email })).toBeVisible();

    const newcomer = await browser.newPage();
    await newcomer.goto(new URL(link).pathname);
    await newcomer.getByLabel("Ваше имя").fill("По Ссылке");
    await newcomer.getByLabel("Пароль", { exact: true }).fill("Ссылка-сработала-2026");
    await newcomer.getByLabel("Повторите пароль").fill("Ссылка-сработала-2026");
    await newcomer.getByRole("button", { name: "Принять приглашение" }).click();
    await expect(newcomer).toHaveURL(/\/app$/);
    await newcomer.close();
  });
});

test("the 2GIS integration page is hidden while the feature is off", async ({ page }) => {
  await signIn(page, accounts.admin);
  expect((await page.goto("/admin/integrations"))?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Интеграции" })).toHaveCount(0);
});

test.describe("manual sending", () => {
  test("a password reset request waits in the queue until the admin sends it", async ({
    page,
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    const visitor = await browser.newPage();
    await visitor.setExtraHTTPHeaders({ "x-real-ip": `198.19.${Date.now() % 250}.${Date.now() % 200}` });
    await visitor.goto("/forgot-password");
    await visitor.getByLabel("Email").fill(accounts.manager);
    await visitor.getByRole("button", { name: "Запросить ссылку" }).click();
    await expect(visitor.getByText(/ссылка подготовлена/)).toBeVisible();
    await visitor.close();

    await signIn(page, accounts.admin);
    await page.goto("/admin/outbox");
    const message = page.getByTestId("outbox-message").filter({ hasText: accounts.manager }).first();
    await expect(message).toContainText("/reset-password?token=");
    await message.getByRole("button", { name: "Отправлено" }).click();
    await expect(message.getByText(/Отправлено /)).toBeVisible();
  });
});
