import type { MetadataRoute } from "next";

import { getEnv } from "@/env";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: new URL("/", getEnv().APP_URL).toString(), changeFrequency: "monthly", priority: 1 }];
}
