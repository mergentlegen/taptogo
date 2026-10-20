import type { FieldValues, Path, UseFormSetError } from "react-hook-form";

import type { ActionError } from "@/server/actions";

/**
 * Puts server-side field errors onto the matching inputs and returns the
 * general message to show above the form (null when every error is placed).
 */
export function applyActionError<T extends FieldValues>(
  error: ActionError,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string | null {
  let placed = false;
  for (const field of fields) {
    const message = error.fieldErrors?.[field]?.[0];
    if (message) {
      setError(field, { type: "server", message });
      placed = true;
    }
  }
  return placed && error.code === "VALIDATION" ? null : error.message;
}
