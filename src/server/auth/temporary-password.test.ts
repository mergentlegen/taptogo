import { describe, expect, it } from "vitest";

import { newPasswordSchema } from "@/features/auth/schemas";

import { generateTemporaryPassword, TEMPORARY_PASSWORD_LENGTH } from "./temporary-password";

describe("generateTemporaryPassword", () => {
  it("always passes the same policy as passwords people choose", () => {
    for (let i = 0; i < 200; i++) {
      const password = generateTemporaryPassword();
      expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH);
      expect(newPasswordSchema.safeParse(password).success).toBe(true);
    }
  });

  it("is different every time", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()));
    expect(seen.size).toBe(50);
  });
});
