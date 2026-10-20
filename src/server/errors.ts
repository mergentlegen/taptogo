export const errorCodes = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "CONFLICT",
  "RATE_LIMITED",
  "SUBSCRIPTION_EXPIRED",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof errorCodes)[number];

/**
 * Expected failure with a stable code. Its message is safe to show to users;
 * anything else thrown is treated as INTERNAL and never exposed.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "AppError";
  }
}
