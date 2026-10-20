/**
 * Environment parsing without the `server-only` guard, so `proxy.ts` can use it.
 * Everything else imports `@/env`, which adds the guard.
 */
import { z } from "zod";

/**
 * Only for local development. Production refuses to start without a real
 * SESSION_SECRET (see the refinement below).
 */
export const DEV_SESSION_SECRET = "dev-only-insecure-session-secret-do-not-use-in-prod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /** Which implementation of repositories/providers `server/container.ts` wires up. */
    DATA_SOURCE: z.enum(["mock"]).default("mock"),
    /** Public base URL used to build card links (/t/{code}) and email links. */
    APP_URL: z.url().default("http://localhost:3000"),
    /** HMAC key for signing the session cookie. At least 32 characters. */
    SESSION_SECRET: z.string().min(32, "must be at least 32 characters").optional(),
    /** IANA time zone used when an organization has none set. */
    DEFAULT_TIMEZONE: z.string().min(1).default("Asia/Almaty"),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === "production" && !value.SESSION_SECRET) {
      ctx.addIssue({
        code: "custom",
        path: ["SESSION_SECRET"],
        message: "is required in production",
      });
    }
  })
  .transform((value) => ({
    ...value,
    SESSION_SECRET: value.SESSION_SECRET ?? DEV_SESSION_SECRET,
    isProduction: value.NODE_ENV === "production",
  }));

export type Env = z.output<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvValidationError";
  }
}

/** Parses an env-like record. Error messages name variables but never echo their values. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(
      result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    );
  }
  return result.data;
}

let cached: Env | undefined;

/** Validated server environment. Throws on first access if the configuration is incomplete. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
