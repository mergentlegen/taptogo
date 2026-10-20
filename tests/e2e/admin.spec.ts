import { expect, test } from "@playwright/test";

import { createSeedData } from "@/mocks/seed";

import { accounts, collectConsoleErrors, signIn } from "./helpers";

const seed = createSeedData();
const coffee = seed.organizations.find((o) => o.name === "Coffee Point")!;

test.describe("admin pages", () => {
  test("every section renders without console errors", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await signIn(page, accounts.superAdmin);
    for (const path of [
      "/admin",
      "/admin/organizations",
      "/admin/organizations/new",
      `/admin/organizations/${coffee.id}`,
      "/admin/cards",
      "/admin/batches",
      "/admin/targets",
      "/admin/billing",
      "/admin/integrations",
      "/admin/support",
      "/admin/leads",
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
  test("the wizard creates a client with a location and an invited owner", async ({ page, isMobile }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    await signIn(page, accounts.admin);
    await page.goto("/admin/organizations/new");
    const name = `E2E Кофейня ${Date.now()}`;

    // Step 1 validates before moving on.
    await page.getByRole("button", { name: "Далее" }).click();
    const currentStep = page.locator('[aria-current="step"]');
    await expect(currentStep).toHaveText(/Организация/);

    await page.getByLabel("Название", { exact: true }).fill(name);
    await page.getByLabel("Контактное лицо").fill("Тест Тестов");
    await page.getByLabel("Телефон").fill("+77001112233");
    await page.getByLabel("Email для связи").fill("e2e-client@example.kz");
    await page.getByRole("button", { name: "Далее" }).click();

    await page.getByLabel("Название филиала").fill(`${name} на Абая`);
    await page.getByLabel("Адрес").fill("Алматы, Абая 1");
    await page.getByRole("button", { name: "Далее" }).click();

    await expect(currentStep).toHaveText(/Владелец/);
    await page.getByLabel("Email владельца").fill(`owner-${Date.now()}@example.kz`);
    await page.getByRole("button", { name: "Далее" }).click();

    await page.getByRole("button", { name: "Создать клиента" }).click();
    await expect(page).toHaveURL(/\/admin\/organizations\/[^/]+$/);
    await expect(page.getByRole("heading", { name })).toBeVisible();

    await page.getByRole("link", { name: "Филиалы", exact: true }).last().click();
    await expect(page.getByText(`${name} на Абая`)).toBeVisible();
  });

  test("staff can open a client's cabinet read-only and leave it", async ({ page, isMobile }) => {
    test.skip(isMobile, "same flow on mobile");
    await signIn(page, accounts.superAdmin);
    await page.goto(`/admin/organizations/${coffee.id}`);
    await page.getByRole("button", { name: "Открыть кабинет (только чтение)" }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByTestId("impersonation-banner")).toContainText("только чтение");
    await expect(page.getByTestId("impersonation-banner")).toContainText("Coffee Point");
    // Read-only: management sections are closed even though staff opened the cabinet.
    expect((await page.goto("/app/team"))?.status()).toBe(403);
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

    // CSV for the print shop: BOM for Excel, one line per card.
    const batchId = page.url().split("/").at(-1)!;
    const csv = await page.request.get(`/admin/batches/${batchId}/export?format=csv`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const body = await csv.text();
    for (const code of codes) expect(body).toContain(`/t/${code}`);
    const zip = await page.request.get(`/admin/batches/${batchId}/export?format=zip`);
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

test.describe("client invitations", () => {
  test("an admin can (re)invite a person into a client's cabinet", async ({ page, isMobile }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    await signIn(page, accounts.admin);
    await page.goto(`/admin/organizations/${coffee.id}?tab=users`);
    const email = `reinvite-${Date.now()}@example.kz`;

    await page.getByRole("button", { name: "Пригласить" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByRole("button", { name: "Отправить приглашение" }).click();
    await expect(page.getByText("Приглашение отправлено")).toBeVisible();
    await expect(page.getByRole("cell", { name: email })).toBeVisible();
  });
});

test.describe("support role", () => {
  test("sees the panel but not management screens", async ({ page }) => {
    await signIn(page, accounts.support);
    expect((await page.goto("/admin/cards"))?.status()).toBe(200);
    await expect(page.getByRole("button", { name: "Назначить клиенту" })).toHaveCount(0);
    expect((await page.goto("/admin/support"))?.status()).toBe(200);

    for (const path of ["/admin/organizations/new", "/admin/staff", "/admin/settings"] as const) {
      expect((await page.goto(path))?.status(), path).toBe(403);
    }
  });
});
