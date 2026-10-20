import { describe, expect, it } from "vitest";

import { newPasswordSchema, resetPasswordSchema, signInSchema } from "./schemas";

describe("newPasswordSchema", () => {
  it("accepts a reasonable password", () => {
    expect(newPasswordSchema.safeParse("Кофе-и-отзывы-2026").success).toBe(true);
  });

  it.each(["short", "qwerty12345", "QWERTY12345", "aaaaaaaaaaaa", "x".repeat(129)])("rejects %j", (pw) => {
    expect(newPasswordSchema.safeParse(pw).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  const token = "a".repeat(43);

  it("requires matching confirmation", () => {
    const result = resetPasswordSchema.safeParse({
      token,
      password: "Long-enough-pass",
      confirmPassword: "Different-pass-1",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["confirmPassword"]);
  });

  it("rejects malformed tokens", () => {
    expect(
      resetPasswordSchema.safeParse({
        token: "../x",
        password: "Long-enough-pass",
        confirmPassword: "Long-enough-pass",
      }).success,
    ).toBe(false);
  });
});

describe("signInSchema", () => {
  it("normalizes email and does not apply the new-password policy", () => {
    const parsed = signInSchema.parse({ email: "  Owner@CoffeePoint.KZ ", password: "demo12345" });
    expect(parsed.email).toBe("owner@coffeepoint.kz");
  });
});
