import { describe, expect, it } from "vitest";
import { z } from "zod";

import { resetPasswordSchema } from "@/features/auth/schemas";
import { cardStatusSchema } from "@/features/cards/schemas";
import { submitLeadSchema } from "@/features/leads/schemas";

import { emailSchema, emptyToNull, phoneSchema, textSchema } from "./schemas";

// The locale is installed by tests/stubs/validation-locale.ts, like in the app.
const firstMessage = (schema: z.ZodType, input: unknown) => {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected a validation error");
  return result.error.issues[0]?.message;
};

describe("validation messages", () => {
  it("speak Russian for built-in checks instead of Zod's English defaults", () => {
    expect(firstMessage(textSchema(120), "   ")).toBe("Обязательное поле");
    expect(firstMessage(textSchema(5), "слишком длинно")).toBe("Максимум 5 символов");
    expect(firstMessage(textSchema(1).optional().pipe(z.string()), undefined)).toBe("Обязательное поле");
    expect(firstMessage(emailSchema, "not-an-email")).toBe("Введите email, например name@example.kz");
    expect(firstMessage(cardStatusSchema, "BROKEN")).toBe("Выберите значение из списка");
    expect(firstMessage(z.int(), 1.5)).toBe("Введите целое число");
    expect(firstMessage(z.string().min(8), "short")).toBe("Минимум 8 символов");
    expect(firstMessage(z.array(z.string()).min(2), ["a"])).toBe("Нужно хотя бы 2 значения");
  });

  it("use dictionary messages for schema-specific rules", () => {
    expect(firstMessage(phoneSchema, "123")).toBe("Формат: +7XXXXXXXXXX");
    const mismatch = resetPasswordSchema.safeParse({
      token: "a".repeat(43),
      password: "Correct-Horse-9",
      confirmPassword: "other",
    });
    expect(mismatch.error?.issues.find((i) => i.path[0] === "confirmPassword")?.message).toBe(
      "Пароли не совпадают",
    );
  });

  it("show the real reason inside optional fields, not the union noise", () => {
    expect(firstMessage(emptyToNull(phoneSchema), "123")).toBe("Формат: +7XXXXXXXXXX");
    const lead = submitLeadSchema.safeParse({ name: "", phone: "8 700", businessName: "Кофейня" });
    const byField = z.flattenError(lead.error!).fieldErrors;
    expect(byField.name).toEqual(["Обязательное поле"]);
    expect(byField.phone).toEqual(["Формат: +7XXXXXXXXXX"]);
  });
});
