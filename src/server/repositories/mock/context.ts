import type { MockDatabase } from "@/mocks/db";
import { notFoundError } from "@/server/i18n";

import type { OrgScope } from "../common";

export type MockContext = {
  db: MockDatabase;
  clock: () => Date;
  newId: () => string;
};

/** Deep copy so callers can never mutate stored rows by accident. */
export function clone<T>(value: T): T {
  return structuredClone(value);
}

export function cloneOrNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : structuredClone(value);
}

export function inScope(row: { organizationId: string | null }, scope?: OrgScope): boolean {
  return !scope || row.organizationId === scope.organizationId;
}

export function requireRow<T>(row: T | undefined, entity: string): T {
  if (row === undefined) throw notFoundError(entity);
  return row;
}

/** Applies defined fields only, so `{ name: undefined }` never wipes a value. */
export function applyPatch<T extends object>(target: T, patch: Partial<NoInfer<T>>): T {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (target as Record<string, unknown>)[key] = structuredClone(value);
  }
  return target;
}

export function newestFirst<T extends { createdAt: string }>(rows: T[]): T[] {
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
