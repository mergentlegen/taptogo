type CspOptions = {
  nonce: string;
  isDevelopment: boolean;
};

/**
 * Scripts are locked down with a per-request nonce. Styles allow inline
 * attributes because server-rendered `style="..."` (charts, popovers) would
 * otherwise be dropped and never restored on hydration.
 */
export function buildContentSecurityPolicy({ nonce, isDevelopment }: CspOptions): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // React uses eval in development to reconstruct server error stacks.
      ...(isDevelopment ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(isDevelopment ? ["ws:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };

  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!isDevelopment) {
    policy.push("upgrade-insecure-requests");
  }
  return policy.join("; ");
}
