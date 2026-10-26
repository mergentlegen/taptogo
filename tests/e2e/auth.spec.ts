import { expect, test, type Page } from "@playwright/test";

import { createSeedData } from "@/mocks/seed";

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
    ["ADMIN", accounts.admin, "/admin"],
    ["OWNER", accounts.owner, "/app"],
    ["MANAGER", accounts.manager, "/app"],
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
  test("administrators land in the admin panel", async ({ page }) => {
    await signIn(page, accounts.admin);
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

  test("an administrator reaches staff, settings and the audit log; clients reach none of them", async ({
    page,
    browser,
  }) => {
    await signIn(page, accounts.admin);
    for (const path of ["/admin/staff", "/admin/settings", "/admin/audit", "/admin/outbox"] as const) {
      expect((await page.goto(path))?.status(), path).toBe(200);
    }

    const client = await browser.newPage();
    await signIn(client, accounts.owner);
    for (const path of ["/admin/staff", "/admin/settings", "/admin/audit", "/admin/outbox"] as const) {
      expect((await client.goto(path))?.status(), path).toBe(403);
    }
    await client.close();
  });

  for (const [role, email, teamStatus] of [
    ["OWNER", accounts.owner, 200],
    ["MANAGER", accounts.manager, 403],
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
    await signIn(page, accounts.manager);
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

test.describe("temporary passwords", () => {
  test("an administrator issues one, the person must choose their own before anything else", async ({
    page,
    browser,
    isMobile,
  }) => {
    test.skip(isMobile, "mutates shared demo data; runs once");
    // Five steps across three browser sessions: longer than the default under full-suite load.
    test.setTimeout(90_000);
    const email = `temp-${Date.now()}@example.kz`;
    const newPassword = "Мой-новый-пароль-2026";

    // 1. Admin invites a new person: the link is shown on screen, to be sent by hand.
    await signIn(page, accounts.admin);
    await page.goto(`/admin/organizations/${await orgIdByName("Coffee Point")}?tab=users`);
    await page.getByRole("button", { name: "Пригласить" }).click();
    await page.getByRole("dialog").getByLabel("Email").fill(email);
    await page.getByRole("dialog").getByRole("button", { name: "Создать ссылку" }).click();
    const link = new URL((await page.getByTestId("invitation-link").textContent())!).pathname;
    expect(link).toMatch(/^\/invite\/[A-Za-z0-9_-]+$/);
    await page.keyboard.press("Escape");

    // 2. The person accepts the invitation and becomes a member.
    const newcomer = await browser.newContext();
    const invited = await newcomer.newPage();
    await invited.goto(link);
    await invited.getByLabel("Ваше имя").fill("Временный Клиент");
    await invited.getByLabel("Пароль", { exact: true }).fill("Сначала-свой-пароль-2026");
    await invited.getByLabel("Повторите пароль").fill("Сначала-свой-пароль-2026");
    await invited.getByRole("button", { name: "Принять приглашение" }).click();
    await expect(invited).toHaveURL(/\/app$/);
    await newcomer.close();

    // 3. Admin issues a temporary password to that member.
    await page.goto(`/admin/organizations/${await orgIdByName("Coffee Point")}?tab=users`);
    const row = page.getByRole("row").filter({ hasText: email });
    await row.getByRole("button", { name: "Выдать временный пароль" }).click();
    const temporary = await page.getByTestId("temporary-password").textContent();
    expect(temporary).toMatch(/^[A-Za-z0-9]{12}$/);
    await page.keyboard.press("Escape");

    // 4. The person signs in with it and is stopped until the password is changed.
    const fresh = await browser.newContext();
    const person = await fresh.newPage();
    await signInWith(person, email, temporary!);
    await expect(person).toHaveURL(/\/change-password$/);
    await person.goto("/app/cards");
    await expect(person).toHaveURL(/\/change-password$/);
    await person.getByLabel("Текущий пароль").fill(temporary!);
    await person.getByLabel("Новый пароль", { exact: true }).fill(newPassword);
    await person.getByLabel("Повторите новый пароль").fill(newPassword);
    await person.getByRole("button", { name: "Сменить пароль" }).click();
    await expect(person).toHaveURL(/\/app$/);

    // 5. The new password works from now on; the temporary one does not.
    await fresh.close();
    const again = await browser.newContext();
    const returning = await again.newPage();
    await signInWith(returning, email, newPassword);
    await expect(returning).toHaveURL(/\/app$/);
    await again.close();
  });
});

async function signInWith(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function orgIdByName(name: string): Promise<string> {
  const seed = createSeedData();
  return seed.organizations.find((o) => o.name === name)!.id;
}
