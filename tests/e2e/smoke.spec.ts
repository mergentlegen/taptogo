import { expect, test } from "@playwright/test";

import { accounts, collectConsoleErrors, signIn } from "./helpers";

test.describe("security headers", () => {
  test("pages carry a nonce-based CSP and hardening headers", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);

    const headers = response.headers();
    const csp = headers["content-security-policy"] ?? "";
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["strict-transport-security"]).toContain("max-age=");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("every request gets a fresh nonce", async ({ request }) => {
    const nonceOf = async () =>
      /'nonce-([^']+)'/.exec((await request.get("/")).headers()["content-security-policy"] ?? "")?.[1];

    const [first, second] = [await nonceOf(), await nonceOf()];
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });

  test("dev tools are not reachable in production builds", async ({ request }) => {
    expect((await request.get("/dev/data")).status()).toBe(404);
    expect((await request.get("/dev/outbox")).status()).toBe(404);
  });
});

test.describe("layouts", () => {
  test("landing renders without console errors", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("оставляет отзыв");
    await expect(page.getByRole("link", { name: "Войти", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("client cabinet navigation works", async ({ page, isMobile }) => {
    const errors = collectConsoleErrors(page);
    await signIn(page, accounts.owner);
    await expect(page.getByRole("heading", { level: 1, name: "Обзор" })).toBeVisible();

    const nav = page.getByRole("navigation", { name: isMobile ? "Нижняя навигация" : "Основная навигация" });
    await nav.getByRole("link", { name: "Карточки" }).click();
    await expect(page).toHaveURL(/\/app\/cards$/);
    await expect(page.getByRole("heading", { level: 1, name: "Карточки" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Карточки" })).toHaveAttribute("aria-current", "page");
    expect(errors).toEqual([]);
  });

  test("mobile 'More' sheet reaches secondary sections", async ({ page, isMobile }) => {
    test.skip(!isMobile, "bottom bar is mobile-only");
    await signIn(page, accounts.owner);

    await page.getByRole("button", { name: "Ещё" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Команда" }).click();
    await expect(page).toHaveURL(/\/app\/team$/);
    await expect(page.getByRole("heading", { level: 1, name: "Команда" })).toBeVisible();
  });

  test("admin panel is visually marked", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await signIn(page, accounts.admin);

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByTestId("admin-badge")).toHaveText("Админ-панель");
    await expect(page.getByRole("heading", { level: 1, name: "Обзор" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("unknown routes show the branded 404", async ({ page }) => {
    const response = await page.goto("/definitely-missing-page");

    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "Страница не найдена" })).toBeVisible();
  });
});

test("theme choice persists across reloads", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("theme-toggle").click();
  await page.getByRole("menuitemradio", { name: "Тёмная" }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);

  await page.getByTestId("theme-toggle").click();
  await page.getByRole("menuitemradio", { name: "Светлая" }).click();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
});
