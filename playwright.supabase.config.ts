import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
// E2E_BASE_URL points the same specs at an already running server (e.g. `wrangler dev` or the
// deployed site) instead of starting a local production build.
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? `http://localhost:${PORT}`;

/**
 * End-to-end run against the REAL Supabase project from .env.local (DATA_SOURCE=supabase),
 * on a production build. The specs create their own throw-away users and organizations
 * and delete them afterwards; they never touch the demo accounts of the mock data source.
 * Run: pnpm test:e2e:supabase
 */
export default defineConfig({
  testDir: "./tests/e2e-supabase",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  timeout: 90_000,
  use: {
    baseURL,
    locale: "ru-RU",
    timezoneId: "Asia/Almaty",
    trace: "retain-on-failure",
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: external
    ? undefined
    : {
        command: `pnpm build && pnpm start --port ${PORT}`,
        url: baseURL,
        timeout: 300_000,
        reuseExistingServer: false,
        env: {
          // Overrides DATA_SOURCE=mock from .env.local; the Supabase keys still come from there.
          DATA_SOURCE: "supabase",
          APP_URL: baseURL,
        },
      },
});
