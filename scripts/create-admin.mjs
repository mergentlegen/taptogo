// Creates the first (or one more) administrator in the Supabase project from .env.local.
//
//   pnpm create-admin you@example.com "Ваше Имя"
//
// A random one-time password is generated and printed to THIS terminal only; the account is
// marked "must change password", so the first sign-in asks for a new one. Nothing is stored
// anywhere else. Run it yourself: the password never needs to leave your machine.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ").trim() || "Администратор";
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: pnpm create-admin you@example.com "Your Name"');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("SUPABASE_URL / SUPABASE_SECRET_KEY are empty in .env.local");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const normalized = email.trim().toLowerCase();
// 16 random bytes → 22 URL-safe characters.
const password = randomBytes(16).toString("base64url");

const { data, error } = await db.auth.admin.createUser({ email: normalized, password, email_confirm: true });
if (error) {
  console.error(`Could not create the account: ${error.message}`);
  process.exit(1);
}

const profile = await db.from("users").insert({
  id: data.user.id,
  email: normalized,
  name,
  platform_role: "ADMIN",
  must_change_password: true,
});
if (profile.error) {
  await db.auth.admin.deleteUser(data.user.id);
  console.error(`Could not create the profile: ${profile.error.message}`);
  process.exit(1);
}

console.info(`Administrator created: ${normalized}`);
console.info(`One-time password:     ${password}`);
console.info("Sign in at /login — you will be asked to choose your own password right away.");
