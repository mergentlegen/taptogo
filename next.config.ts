import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Static security headers. Content-Security-Policy is set per request in
 * `src/proxy.ts` because it carries a fresh script nonce.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // Nonce-based CSP requires every page to render per request, which is
  // incompatible with Cache Components / Partial Prerendering (see docs/ARCHITECTURE.md).
  cacheComponents: false,
  reactCompiler: true,
  typedRoutes: true,
  poweredByHeader: false,
  experimental: {
    // forbidden() → 403 page (src/app/forbidden.tsx) when a role lacks access.
    authInterrupts: true,
    serverActions: {
      // Logos are capped at 2 MB; the rest is multipart overhead.
      bodySizeLimit: "2200kb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      // Everything except the card redirect, which sets its own (stricter) headers.
      { source: "/((?!t/).*)", headers: securityHeaders },
      {
        source: "/t/:code",
        headers: securityHeaders.filter(
          ({ key }) => key !== "Referrer-Policy" && key !== "Cross-Origin-Opener-Policy",
        ),
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
