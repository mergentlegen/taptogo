import type { MetadataRoute } from "next";

import { getEnv } from "@/env";

// Read APP_URL at request time, not at build time.
export const dynamic = "force-dynamic";

/** Only the landing page is meant for search engines; cabinets, card links and tokens are not. */
export default function robots(): MetadataRoute.Robots {
  const base = getEnv().APP_URL;
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/app",
        "/admin",
        "/t/",
        "/dev",
        "/invite/",
        "/reset-password",
        "/forgot-password",
        "/login",
      ],
    },
    sitemap: new URL("/sitemap.xml", base).toString(),
  };
}
