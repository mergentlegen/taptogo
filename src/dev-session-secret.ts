/**
 * Only for local development. Production refuses to start without a real
 * SESSION_SECRET (see src/env.core.ts). Kept in its own file so that proxy.ts can use it
 * without loading the whole environment schema (and the validation library) into its bundle.
 */
export const DEV_SESSION_SECRET = "dev-only-insecure-session-secret-do-not-use-in-prod";
