// Uploads the server secrets from .env.local to the deployed Cloudflare Worker.
//
//   pnpm cf:secrets
//
// The values go straight from the file to Cloudflare over wrangler's stdin: they are never
// printed and never written to wrangler.jsonc (which is committed). Run it once after the
// first deploy, and again whenever a secret changes.
import { spawnSync } from "node:child_process";

const names = ["SUPABASE_SECRET_KEY", "CRON_SECRET"];

for (const name of names) {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} is empty in .env.local`);
    process.exit(1);
  }
  const result = spawnSync("pnpm", ["wrangler", "secret", "put", name], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`Could not upload ${name}`);
    process.exit(result.status ?? 1);
  }
}
console.info("Secrets uploaded.");
