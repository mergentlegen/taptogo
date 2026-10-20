import { expect, test } from "@playwright/test";

import { accounts, DEMO_PASSWORD, signIn } from "./helpers";

test.describe("anonymous visitors", () => {
  for (const path of ["/app", "/app/cards", "/admin", "/admin/staff"]) {
    test(`are sent from ${path} to the login page`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
    });
  }

  test("return to the requested page after signing in", async ({ page }) => {
    await page.goto("/app/locations");
    await page.getByLabel("Email").fill(accounts.owner);
    await page.getByLabel("Пароль").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Войти", exact: true }).click();

    await expect(page).toHaveURL(/\/app\/locations$/);
  });

  test("never see the dev 'Sign in as…' block in production", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByTestId("demo-login")).toHaveCount(0);
  });

  test("get one generic message for wrong credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(`nobody-${Date.now()}@example.kz`);
    await page.getByLabel("Пароль").fill("wrong-password");
    await page.getByRole("button", { name: "Войти", exact: true }).click();

    await expect(page.getByRole("alert").filter({ hasText: "email" })).toHaveText(
      "Неверный email или пароль",
    );
    await expect(page).toHaveURL(/\/login/);
  });

  test("cannot use ?next= as an open redirect", async ({ page }) => {
    await signIn(page, accounts.owner, "//evil.example/steal");
    await expect(page).toHaveURL(/localhost:\d+\/app$/);
  });
});

test.describe("signing in with every role", () => {
  for (const [role, email, home] of [
    ["SUPER_ADMIN", accounts.superAdmin, "/admin"],
    ["ADMIN", accounts.admin, "/admin"],
    ["SUPPORT", accounts.support, "/admin"],
    ["OWNER", accounts.owner, "/app"],
    ["MANAGER", accounts.manager, "/app"],
    ["VIEWER", accounts.viewer, "/app"],
  ] as const) {
    test(`${role} signs in through the form and lands in ${home}`, async ({ page }) => {
      await signIn(page, email);
      await expect(page).toHaveURL(new RegExp(`${home}$`));
      if (home === "/admin") {
        await expect(page.getByTestId("admin-badge")).toBeVisible();
        await expect(page.getByRole("heading", { level: 1, name: "Обзор" })).toBeVisible();
      } else {
        await expect(page.getByRole("heading", { level: 1, name: "Дашборд" })).toBeVisible();
      }
    });
  }
});

test.describe("role access (server-enforced)", () => {
  test("platform staff land in the admin panel; clients in the cabinet", async ({ page }) => {
    await signIn(page, accounts.support);
    await expect(page).toHaveURL(/\/admin$/);
  });

  test("clients get 403 in the admin panel", async ({ page }) => {
    await signIn(page, accounts.owner);
    const response = await page.goto("/admin/organizations");

    expect(response?.status()).toBe(403);
    await expect(page.getByRole("heading", { name: "Нет доступа" })).toBeVisible();
  });

  test("staff without a membership get 403 in the cabinet", async ({ page }) => {
    await signIn(page, accounts.admin);
    expect((await page.goto("/app"))?.status()).toBe(403);
  });

  test("only SUPER_ADMIN manages staff and system settings", async ({ page }) => {
    await signIn(page, accounts.support);
    await expect(page.getByRole("link", { name: "Сотрудники платформы" })).toHaveCount(0);
    expect((await page.goto("/admin/staff"))?.status()).toBe(403);
    expect((await page.goto("/admin/settings"))?.status()).toBe(403);
    expect((await page.goto("/admin/audit"))?.status()).toBe(200);
  });

  test("SUPER_ADMIN reaches staff management", async ({ page }) => {
    await signIn(page, accounts.superAdmin);
    expect((await page.goto("/admin/staff"))?.status()).toBe(200);
  });

  for (const [role, email, teamStatus] of [
    ["OWNER", accounts.owner, 200],
    ["MANAGER", accounts.manager, 403],
    ["VIEWER", accounts.viewer, 403],
  ] as const) {
    test(`${role} gets ${teamStatus} on the team page`, async ({ page }) => {
      await signIn(page, email);
      expect((await page.goto("/app/team"))?.status()).toBe(teamStatus);
    });
  }
});

test.describe("organizations", () => {
  test("a user in two organizations can switch between them", async ({ page, isMobile }) => {
    test.skip(isMobile, "switcher behaviour is the same on mobile");
    await signIn(page, accounts.owner);
    const switcher = page.getByTestId("org-switcher");
    await expect(switcher).toContainText("Coffee Point");

    await switcher.click();
    await page.getByRole("menuitem", { name: /AquaDrive/ }).click();
    await expect(switcher).toContainText("AquaDrive");
    // Manager there, so the owner-only team section disappears from the menu.
    await expect(page.getByRole("link", { name: "Команда" })).toHaveCount(0);
    expect((await page.goto("/app/team"))?.status()).toBe(403);
  });

  test("a forged organization cookie is ignored", async ({ page, context }) => {
    await signIn(page, accounts.viewer);
    await context.addCookies([
      { name: "ttg_org", value: "6f1c3c62-0000-4000-8000-000000000000", url: page.url() },
    ]);
    await page.reload();

    await expect(page.getByTestId("org-switcher")).toContainText("Coffee Point");
  });
});

test.describe("sessions", () => {
  test("signing out ends the session", async ({ page }) => {
    await signIn(page, accounts.manager);
    await page.getByTestId("user-menu").click();
    await page.getByRole("menuitem", { name: "Выйти" }).click();

    await expect(page).toHaveURL(/\/login\?signedOut=1/);
    await expect(page.getByRole("status")).toContainText("Вы вышли");
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test("a tampered session cookie is rejected", async ({ page, context }) => {
    await signIn(page, accounts.owner);
    const cookie = (await context.cookies()).find((c) => c.name === "ttg_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");

    await context.addCookies([{ ...cookie!, value: `${cookie!.value.slice(0, -4)}AAAA` }]);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});

test("an invited person sets a password and lands in the cabinet", async ({ page, isMobile }) => {
  test.skip(isMobile, "the seeded invitation can be accepted only once per server");
  await page.goto("/invite/demo-invitation-token-coffee-point");
  await expect(page.getByRole("heading", { name: /Приглашение в Coffee Point/ })).toBeVisible();

  await page.getByLabel("Ваше имя").fill("Новый Бариста");
  await page.getByLabel("Пароль", { exact: true }).fill("Кофе-с-молоком-2026");
  await page.getByLabel("Повторите пароль").fill("Кофе-с-молоком-2026");
  await page.getByRole("button", { name: "Принять приглашение" }).click();

  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId("org-switcher")).toContainText("Coffee Point");
});
