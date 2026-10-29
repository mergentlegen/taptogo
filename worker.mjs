// Entry point of the Cloudflare Worker: the OpenNext handler plus a daily keepalive.
//
// Free Supabase projects are paused after a week without activity. A pause takes the card
// links down, so a Cron Trigger (see wrangler.jsonc) touches the database once a day.
// It is a plain `select` of one row: nothing is written and nothing reaches the audit log.
import openNext from "./.open-next/worker.js";

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";

/**
 * @param {{ SUPABASE_URL: string; SUPABASE_SECRET_KEY: string }} env
 */
async function keepAlive(env) {
  // The secret key bypasses RLS, so the query succeeds whatever the policies are.
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/platform_settings?select=id&limit=1`, {
    headers: { apikey: env.SUPABASE_SECRET_KEY },
  });
  if (!response.ok) {
    // Thrown so the failed run is visible in Cloudflare (Workers → taptogo → Observability).
    throw new Error(`Supabase keepalive failed: HTTP ${response.status}`);
  }
  console.info("Supabase keepalive ok");
}

const worker = {
  fetch: openNext.fetch,

  /**
   * @param {unknown} _controller
   * @param {{ SUPABASE_URL: string; SUPABASE_SECRET_KEY: string }} env
   * @param {{ waitUntil(promise: Promise<unknown>): void }} ctx
   */
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(keepAlive(env));
  },
};

export default worker;
