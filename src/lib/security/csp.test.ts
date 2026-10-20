import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "./csp";

describe("buildContentSecurityPolicy", () => {
  it("locks scripts to the nonce and forbids framing", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc123", isDevelopment: false });

    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("never allows unsafe-inline or unsafe-eval scripts in production", () => {
    const csp = buildContentSecurityPolicy({ nonce: "n", isDevelopment: false });
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src")) ?? "";

    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("allows eval only in development", () => {
    const csp = buildContentSecurityPolicy({ nonce: "n", isDevelopment: true });

    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
