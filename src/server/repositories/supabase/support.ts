import "server-only";

import type { z } from "zod";

import { serviceError, type ServerErrorKey } from "@/server/i18n";
import type { Db } from "@/server/supabase/clients";

/** Resolves the Supabase client for one call: the user's (RLS) or the system's. */
export type DbGetter = () => Promise<Db>;

/** Rows per request. PostgREST caps a response at 1000 rows by default. */
export const PAGE_SIZE = 1000;

/** Ids / codes per `in (…)` filter, so the request URL stays short. */
export const IN_CHUNK = 100;

type PgError = { code?: string; message: string; details?: string | null; hint?: string | null };

export type ErrorHints = {
  /** Message for a unique violation (23505). */
  conflict?: ServerErrorKey;
  /** Message for the trigger "check_violation" (23514), e.g. the last owner leaving. */
  check?: ServerErrorKey;
};

/**
 * Turns a PostgREST/Postgres error into the error the services expect:
 * - 42501 (RLS / guard triggers)  → FORBIDDEN
 * - 23505 (unique)                → CONFLICT
 * - 23514 (check, e.g. last owner) → CONFLICT
 * - 23503 (foreign key)           → NOT_FOUND (the referenced row does not exist)
 * Anything else is a bug or an outage: a plain Error, logged and shown as INTERNAL.
 */
export function fail(error: PgError, hints: ErrorHints = {}): never {
  switch (error.code) {
    case "42501":
      throw serviceError("FORBIDDEN", "forbidden");
    case "23505":
      throw serviceError("CONFLICT", hints.conflict ?? "notFound");
    case "23514":
      throw serviceError("CONFLICT", hints.check ?? "forbidden");
    case "23503":
      throw serviceError("NOT_FOUND", "notFound");
  }
  throw new Error(`Supabase: ${error.code ?? "?"} ${error.message}`);
}

type Result<T> = { data: T; error: PgError | null };

/**
 * The data of a query that must have succeeded. `T` is the union of the success and
 * failure shapes of the response (a row or null for `maybeSingle`), so callers must
 * still handle "no row".
 */
export function ok<T>(result: Result<T>, hints?: ErrorHints): T {
  if (result.error) fail(result.error, hints);
  return result.data;
}

/** The data of a query that must return exactly one row (`.single()`, scalar rpc). */
export function one<T>(result: Result<T>, hints?: ErrorHints): NonNullable<T> {
  const data = ok(result, hints);
  if (data === null || data === undefined) throw new Error("Supabase: expected a row, got none");
  return data as NonNullable<T>;
}

/** Like `ok`, for list queries: no rows is an empty array. */
export function rows<T>(result: Result<T[] | null>, hints?: ErrorHints): T[] {
  return ok(result, hints) ?? [];
}

/**
 * The generated RPC types mark arguments without a default as non-null, although
 * Postgres accepts NULL for them. Use for arguments the SQL function handles as null.
 */
export function nullable<T>(value: T | null): T {
  return value as T;
}

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const camel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/**
 * camelCase entity (or patch) → snake_case columns. `undefined` fields are
 * dropped, so `{ name: undefined }` never wipes a value (same as the mocks).
 */
// The camelCase → snake_case mapping cannot be expressed in the type system, so the result
// is untyped here; column names are verified by the integration tests and by Zod on read.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toRow(value: object): any {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([key, v]) => [snake(key), v]),
  );
}

/**
 * Postgres timestamptz arrives as "2026-10-26T15:47:24.232123+00:00". The app
 * works with UTC instants in the "…Z" form (`timestampSchema`).
 */
export function toInstant(value: string): string {
  return new Date(value).toISOString();
}

/** snake_case row → camelCase, timestamps normalized, validated by the entity schema. */
export function fromRow<S extends z.ZodType>(schema: S, row: object): z.output<S> {
  const entity = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      camel(key),
      key.endsWith("_at") && typeof value === "string" ? toInstant(value) : value,
    ]),
  );
  return schema.parse(entity);
}

export function fromRows<S extends z.ZodType>(schema: S, list: readonly object[]): z.output<S>[] {
  return list.map((row) => fromRow(schema, row));
}

export function chunk<T>(items: readonly T[], size = IN_CHUNK): T[][] {
  const parts: T[][] = [];
  for (let i = 0; i < items.length; i += size) parts.push(items.slice(i, i + size));
  return parts;
}

/**
 * Reads every row of an ordered query, page by page. The query must have a
 * stable, total order, otherwise pages could overlap or skip rows.
 */
export async function readAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<Result<T[] | null>>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = rows(await fetchPage(from, from + PAGE_SIZE - 1));
    all.push(...page);
    if (page.length < PAGE_SIZE) return all;
  }
}

/** Escapes `%`, `_` and `\` so user text is matched literally by LIKE/ILIKE. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * A value inside a PostgREST `or(…)` / `and(…)` expression: quoted, so commas,
 * parentheses and dots in user text cannot change the filter's structure.
 */
export function quote(text: string): string {
  return `"${text.replace(/[\\"]/g, (c) => `\\${c}`)}"`;
}

/** Collation-independent "Russian alphabet" order, like the mocks. */
export const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, "ru");
