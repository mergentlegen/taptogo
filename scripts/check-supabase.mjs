// Checks that .env.local reaches the Supabase project and that RLS behaves.
// Run: pnpm check:supabase   (prints no secrets)
import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY } = process.env;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
let failed = false;

function report(ok, text) {
  if (!ok) failed = true;
  console.info(`${ok ? "OK  " : "FAIL"} ${text}`);
}

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  report(false, "SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are empty in .env.local");
  process.exit(1);
}

// 1. The publishable key without a session must see nothing: RLS closes every table.
const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, options);
const anonRead = await anon.from("platform_settings").select("id");
report(!anonRead.error && anonRead.data.length === 0, "publishable key without a session sees no rows (RLS)");

const anonRpc = await anon.rpc("increment_daily_card_stat", {
  p_card_id: "00000000-0000-0000-0000-000000000000",
  p_date: "2026-01-01",
  p_organization_id: "00000000-0000-0000-0000-000000000000",
  p_location_id: null,
  p_employee_id: null,
  p_taps: 1,
  p_unique_visitors: 1,
  p_nfc_taps: 1,
  p_qr_taps: 0,
});
report(Boolean(anonRpc.error), "publishable key cannot call the system function increment_daily_card_stat");

// 2. The secret key bypasses RLS and sees the seeded settings row.
if (!SUPABASE_SECRET_KEY) {
  report(false, "SUPABASE_SECRET_KEY is empty in .env.local (insert it, then run again)");
} else {
  const system = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, options);
  const settings = await system.from("platform_settings").select("id, grace_days");
  report(!settings.error && settings.data.length === 1, "secret key reads platform_settings (1 row)");
  if (settings.error) console.info(`     ${settings.error.message}`);
}

process.exit(failed ? 1 : 0);
