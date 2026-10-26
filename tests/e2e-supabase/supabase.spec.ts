import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  // keys may come from the real environment
}

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
const run = crypto.randomUUID().slice(0, 8);
const PASSWORD = `Pw-${crypto.randomUUID()}`;
const NEW_PASSWORD = `Новый-${crypto.randomUUID()}`;
const ORG_NAME = `E2E Supabase ${run}`;

test.describe.configure({ mode: "serial" });
test.skip(!SUPABASE_URL || !SUPABASE_SECRET_KEY, "Supabase keys are not configured");

let db: SupabaseClient;
const authIds: string[] = [];
const emails: string[] = [];
let orgId = "";
const email = (label: string) => `e2e-${run}-${label}@example.kz`;

async function createUser(label: string, platformRole: "ADMIN" | null = null) {
  const address = email(label);
  emails.push(address);
  const { data, error } = await db.auth.admin.createUser({
    email: address,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  authIds.push(data.user.id);
  const profile = await db
    .from("users")
    .insert({ id: data.user.id, email: address, name: `E2E ${label}`, platform_role: platformRole });
  if (profile.error) throw profile.error;
  return { id: data.user.id, email: address };
}

async function signIn(page: Page, address: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  return { context, page: await context.newPage() };
}

test.beforeAll(async () => {
  db = createClient(SUPABASE_URL!, SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  await createUser("admin", "ADMIN");
  const owner = await createUser("owner");
  const created = await db.rpc("create_client", {
    p_organization: {
      name: ORG_NAME,
      contactName: "Тест Тестов",
      contactPhone: "+77001112233",
      contactEmail: email("contact"),
      timezone: "Asia/Almaty",
    },
    p_locations: [{ name: `${ORG_NAME} филиал`, address: "Алматы, Абая 1" }],
    p_subscription: { plan: "START", cardLimit: 5, paidUntil: "2030-01-01", status: "ACTIVE" },
  });
  if (created.error) throw created.error;
  orgId = created.data as string;
  const member = await db
    .from("memberships")
    .insert({ user_id: owner.id, organization_id: orgId, role: "OWNER" });
  if (member.error) throw member.error;
});

test.afterAll(async () => {
  if (!db) return;
  if (orgId) await db.from("organizations").delete().eq("id", orgId);
  for (const address of emails) await db.from("outbox_messages").delete().eq("to_address", address);
  for (const id of authIds) await db.auth.admin.deleteUser(id);
});

test("anonymous visitors are sent to the login page", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
  await page.goto("/admin/staff");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fstaff$/);
});

test("wrong credentials get one generic message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email("owner"));
  await page.getByLabel("Пароль").fill("wrong-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "email" })).toHaveText("Неверный email или пароль");
});

test("a client signs in, keeps the session, and signs out", async ({ page, context }) => {
  await signIn(page, email("owner"));
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { level: 1, name: "Дашборд" })).toBeVisible();
  await expect(page.getByTestId("org-switcher")).toContainText(ORG_NAME);

  // The session cookies belong to Supabase, are not readable by scripts, and no app cookie replaces them.
  const cookies = await context.cookies();
  const session = cookies.filter((c) => c.name.startsWith("sb-"));
  expect(session.length).toBeGreaterThan(0);
  expect(session.every((c) => c.httpOnly && c.sameSite === "Lax")).toBe(true);
  expect(cookies.some((c) => c.name === "ttg_session")).toBe(false);

  await page.reload();
  await expect(page.getByTestId("org-switcher")).toContainText(ORG_NAME);
  expect((await page.goto("/app/team"))?.status()).toBe(200);
  expect((await page.goto("/admin"))?.status()).toBe(403);

  await page.goto("/app");
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login\?signedOut=1/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login\?next=/);
});

test("an administrator reaches the admin panel and its pages", async ({ page }) => {
  await signIn(page, email("admin"));
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId("admin-badge")).toBeVisible();

  for (const path of [
    "/admin/organizations",
    `/admin/organizations/${orgId}`,
    "/admin/cards",
    "/admin/batches",
    "/admin/targets",
    "/admin/billing",
    "/admin/outbox",
    "/admin/support",
    "/admin/leads",
    "/admin/staff",
    "/admin/audit",
    "/admin/settings",
  ]) {
    expect((await page.goto(path))?.status(), path).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
  }
  // Staff have no membership: the cabinet is closed to them.
  expect((await page.goto("/app"))?.status()).toBe(403);
});

test("staff can look into a client's cabinet read-only", async ({ page }) => {
  await signIn(page, email("admin"));
  await page.goto(`/admin/organizations/${orgId}`);
  await page.getByRole("button", { name: "Открыть кабинет (только чтение)" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId("impersonation-banner")).toContainText(ORG_NAME);
  expect((await page.goto("/app/team"))?.status()).toBe(403);

  await page.goto("/app");
  await page.getByRole("button", { name: "Выйти из кабинета" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/organizations/${orgId}$`));
  await expect(page.getByTestId("impersonation-banner")).toHaveCount(0);
});

test("an invitation travels through the manual queue and creates a working account", async ({
  page,
  browser,
}) => {
  const invited = email("invited");
  emails.push(invited);
  await signIn(page, email("admin"));
  await page.goto(`/admin/organizations/${orgId}?tab=users`);
  await page.getByRole("button", { name: "Пригласить" }).click();
  await page.getByRole("dialog").getByLabel("Email").fill(invited);
  await page.getByRole("dialog").getByRole("button", { name: "Отправить приглашение" }).click();
  await expect(page.getByText("Приглашение отправлено")).toBeVisible();

  await page.goto("/admin/outbox");
  const message = page.getByTestId("outbox-message").filter({ hasText: invited });
  const link = /\/invite\/[A-Za-z0-9_-]+/.exec((await message.textContent()) ?? "")?.[0];
  expect(link).toBeTruthy();
  await message.getByRole("button", { name: "Отправлено" }).click();
  await expect(message.getByText(/Отправлено /)).toBeVisible();

  const { context, page: newcomer } = await freshPage(browser);
  await newcomer.goto(link!);
  await newcomer.getByLabel("Ваше имя").fill("Приглашённый Е2Е");
  await newcomer.getByLabel("Пароль", { exact: true }).fill(NEW_PASSWORD);
  await newcomer.getByLabel("Повторите пароль").fill(NEW_PASSWORD);
  await newcomer.getByRole("button", { name: "Принять приглашение" }).click();
  await expect(newcomer).toHaveURL(/\/app$/);
  await expect(newcomer.getByTestId("org-switcher")).toContainText(ORG_NAME);
  await context.close();

  // The new person appears in the database and can sign in again later.
  const profile = await db.from("users").select("id").eq("email", invited).single();
  if (profile.data) authIds.push(profile.data.id);
  const again = await freshPage(browser);
  await signIn(again.page, invited, NEW_PASSWORD);
  await expect(again.page).toHaveURL(/\/app$/);
  await again.context.close();
});

test("a temporary password must be replaced before anything else", async ({ page, browser }) => {
  await signIn(page, email("admin"));
  await page.goto(`/admin/organizations/${orgId}?tab=users`);
  const row = page.getByRole("row").filter({ hasText: email("owner") });
  await row.getByRole("button", { name: "Выдать временный пароль" }).click();
  const temporary = (await page.getByTestId("temporary-password").textContent())!;
  expect(temporary).toMatch(/^[A-Za-z0-9]{12}$/);
  await page.keyboard.press("Escape");

  const { context, page: person } = await freshPage(browser);
  await signIn(person, email("owner"), temporary);
  await expect(person).toHaveURL(/\/change-password$/);
  await person.goto("/app/cards");
  await expect(person).toHaveURL(/\/change-password$/);
  await person.getByLabel("Текущий пароль").fill(temporary);
  await person.getByLabel("Новый пароль", { exact: true }).fill(NEW_PASSWORD);
  await person.getByLabel("Повторите новый пароль").fill(NEW_PASSWORD);
  await person.getByRole("button", { name: "Сменить пароль" }).click();
  await expect(person).toHaveURL(/\/app$/);
  await context.close();

  const later = await freshPage(browser);
  await signIn(later.page, email("owner"), NEW_PASSWORD);
  await expect(later.page).toHaveURL(/\/app$/);
  await later.context.close();
});
