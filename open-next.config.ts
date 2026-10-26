import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is rendered per request (nonce-based CSP, personal data), so there is
// no incremental cache to configure.
export default defineCloudflareConfig();
