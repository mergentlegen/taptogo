import { describe, expect, it } from "vitest";

import { DEV_SESSION_SECRET, EnvValidationError, parseEnv } from "./env";

describe("parseEnv", () => {
  it("works with no variables in development", () => {
    const env = parseEnv({ NODE_ENV: "development" });

    expect(env.DATA_SOURCE).toBe("mock");
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.DEFAULT_TIMEZONE).toBe("Asia/Almaty");
    expect(env.SESSION_SECRET).toBe(DEV_SESSION_SECRET);
    expect(env.isProduction).toBe(false);
  });

  it("refuses to start in production without SESSION_SECRET", () => {
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(EnvValidationError);
    expect(() => parseEnv({ NODE_ENV: "production" })).toThrow(/SESSION_SECRET/);
  });

  it("accepts a strong secret in production", () => {
    const secret = "x".repeat(48);
    const env = parseEnv({ NODE_ENV: "production", SESSION_SECRET: secret });

    expect(env.SESSION_SECRET).toBe(secret);
    expect(env.isProduction).toBe(true);
  });

  it("rejects short secrets and unknown data sources without leaking values", () => {
    const run = () =>
      parseEnv({ NODE_ENV: "development", SESSION_SECRET: "short-secret", DATA_SOURCE: "oracle" });

    expect(run).toThrow(/SESSION_SECRET/);
    expect(run).toThrow(/DATA_SOURCE/);
    expect(run).not.toThrow(/short-secret/);
  });

  it("rejects a malformed APP_URL", () => {
    expect(() => parseEnv({ APP_URL: "not a url" })).toThrow(/APP_URL/);
  });

  it("treats empty Supabase variables as not set", () => {
    const env = parseEnv({
      SUPABASE_URL: "",
      SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SECRET_KEY: "",
      CRON_SECRET: "",
      TWOGIS_API_KEY: "",
    });

    expect(env.SUPABASE_URL).toBeUndefined();
    expect(env.SUPABASE_SECRET_KEY).toBeUndefined();
    expect(env.CRON_SECRET).toBeUndefined();
  });

  it("validates Supabase variables when they are set, without echoing them", () => {
    const run = () => parseEnv({ SUPABASE_URL: "nope", CRON_SECRET: "short-cron" });

    expect(run).toThrow(/SUPABASE_URL/);
    expect(run).toThrow(/CRON_SECRET/);
    expect(run).not.toThrow(/short-cron/);
  });

  it("needs the Supabase keys, but no SESSION_SECRET, when the data source is supabase", () => {
    const run = () => parseEnv({ NODE_ENV: "production", DATA_SOURCE: "supabase" });
    expect(run).toThrow(/SUPABASE_URL/);
    expect(run).toThrow(/SUPABASE_SECRET_KEY/);
    expect(run).not.toThrow(/SESSION_SECRET/);

    const env = parseEnv({
      NODE_ENV: "production",
      DATA_SOURCE: "supabase",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
      SUPABASE_SECRET_KEY: "sb_secret_x",
    });
    expect(env.DATA_SOURCE).toBe("supabase");
  });
});
