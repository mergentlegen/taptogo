/**
 * Conventions shared by every repository:
 * - all methods are async, like the future Supabase implementations;
 * - returned objects are copies — mutating them never changes stored data;
 * - `update` throws AppError NOT_FOUND when the row does not exist (or is
 *   outside the given scope);
 * - tenant data accepts an optional `OrgScope`. When present, rows of other
 *   organizations are invisible, exactly like Row Level Security will make them.
 *   Client-cabinet services must always pass it.
 */

export type OrgScope = { organizationId: string };

/** Fields the storage layer fills in on insert. */
export type NewEntity<T, Generated extends keyof T = never> = Omit<T, "id" | "createdAt" | Generated>;

export type Page<T> = { items: T[]; nextCursor: string | null };

export type DateRange = { from: string; to: string };
