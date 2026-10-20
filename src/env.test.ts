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
});
