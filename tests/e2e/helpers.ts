import { expect, type Page } from "@playwright/test";

/** Same for every seeded account; works whenever DATA_SOURCE=mock. */
export const DEMO_PASSWORD = "demo12345";

export const accounts = {
  admin: "admin@taptogo.kz",
  owner: "owner@coffeepoint.kz",
  manager: "manager@coffeepoint.kz",
} as const;

/** Signs in through the real form (the "Sign in as…" shortcut does not exist in production builds). */
export async function signIn(page: Page, email: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Fails the test on CSP violations, hydration mismatches and other console errors. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}
