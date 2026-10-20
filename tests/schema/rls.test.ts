/**
 * Executes docs/supabase/schema.sql in PGlite (real Postgres compiled to WASM)
 * on top of minimal Supabase stubs, then checks the access model role by role.
 * Keeps the schema draft honest while the app still runs on mocks.
 *
 * Every test runs in a transaction that is rolled back, so tests are independent.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

const schema = readFileSync(
  fileURLToPath(new URL("../../docs/supabase/schema.sql", import.meta.url)),
  "utf8",
);

/** What Supabase provides before our migrations run: roles, auth.uid(), storage. */
const supabaseStubs = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text
);
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated, service_role;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
`;

const uuid = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const U = {
  ownerA: uuid(1),
  managerA: uuid(2),
  viewerA: uuid(3),
  ownerB: uuid(4),
  support: uuid(5),
  admin: uuid(6),
  superAdmin: uuid(7),
};
const ORG_A = uuid(101);
const ORG_B = uuid(102);
const LOC_A = uuid(201);
const LOC_B = uuid(202);
const TARGET_A = uuid(301);
const TARGET_A_UNVERIFIED = uuid(302);
const TARGET_B = uuid(303);
const BATCH = uuid(401);
const CARD_A = uuid(501);
const CARD_B = uuid(502);
const CARD_FREE = uuid(503);

const fixtures = `
insert into auth.users (id) values ${Object.values(U)
  .map((id) => `('${id}')`)
  .join(", ")};
insert into public.users (id, email, name, platform_role) values
  ('${U.ownerA}', 'owner@a.kz', 'Owner A', null),
  ('${U.managerA}', 'manager@a.kz', 'Manager A', null),
  ('${U.viewerA}', 'viewer@a.kz', 'Viewer A', null),
  ('${U.ownerB}', 'owner@b.kz', 'Owner B', null),
  ('${U.support}', 'support@taptogo.kz', 'Support', 'SUPPORT'),
  ('${U.admin}', 'admin@taptogo.kz', 'Admin', 'ADMIN'),
  ('${U.superAdmin}', 'superadmin@taptogo.kz', 'Super', 'SUPER_ADMIN');
insert into public.organizations (id, name, contact_name, contact_phone, contact_email) values
  ('${ORG_A}', 'A', 'A', '+77010000001', 'a@a.kz'),
  ('${ORG_B}', 'B', 'B', '+77010000002', 'b@b.kz');
insert into public.memberships (user_id, organization_id, role) values
  ('${U.ownerA}', '${ORG_A}', 'OWNER'), ('${U.managerA}', '${ORG_A}', 'MANAGER'),
  ('${U.viewerA}', '${ORG_A}', 'VIEWER'), ('${U.ownerB}', '${ORG_B}', 'OWNER');
insert into public.locations (id, organization_id, name, address) values
  ('${LOC_A}', '${ORG_A}', 'Филиал A', 'Алматы'), ('${LOC_B}', '${ORG_B}', 'Филиал B', 'Астана');
insert into public.redirect_targets (id, organization_id, location_id, type, url, is_verified) values
  ('${TARGET_A}', '${ORG_A}', '${LOC_A}', 'TWOGIS_REVIEW', 'https://2gis.kz/a', true),
  ('${TARGET_A_UNVERIFIED}', '${ORG_A}', null, 'CUSTOM', 'https://2gis.kz/x', false),
  ('${TARGET_B}', '${ORG_B}', '${LOC_B}', 'TWOGIS_REVIEW', 'https://2gis.kz/b', true);
insert into public.card_batches (id, name, quantity, card_type) values ('${BATCH}', 'Партия', 3, 'NFC_CARD');
insert into public.cards (id, code, batch_id, number, organization_id, location_id, target_id, label, type, status) values
  ('${CARD_A}', 'AAAAaaa1', '${BATCH}', 1, '${ORG_A}', '${LOC_A}', '${TARGET_A}', 'Касса', 'NFC_CARD', 'ACTIVE'),
  ('${CARD_B}', 'BBBBbbb1', '${BATCH}', 2, '${ORG_B}', '${LOC_B}', '${TARGET_B}', 'Касса', 'NFC_CARD', 'ACTIVE'),
  ('${CARD_FREE}', 'FFFFfff1', '${BATCH}', 3, null, null, null, 'Свободная', 'NFC_CARD', 'UNASSIGNED');
insert into public.daily_card_stats (card_id, date, organization_id, location_id, taps, unique_visitors, nfc_taps, qr_taps) values
  ('${CARD_A}', '2026-10-16', '${ORG_A}', '${LOC_A}', 5, 4, 5, 0),
  ('${CARD_A}', '2026-10-17', '${ORG_A}', '${LOC_A}', 3, 3, 2, 1),
  ('${CARD_B}', '2026-10-17', '${ORG_B}', '${LOC_B}', 7, 6, 7, 0);
insert into public.tap_events (id, card_id, organization_id, occurred_at, source, device_type, os) values
  ('${uuid(601)}', '${CARD_A}', '${ORG_A}', now(), 'NFC', 'MOBILE', 'IOS'),
  ('${uuid(602)}', '${CARD_B}', '${ORG_B}', now(), 'QR', 'MOBILE', 'ANDROID');
insert into public.payments (organization_id, amount_kzt, paid_at, method) values ('${ORG_A}', 9900, now(), 'KASPI');
`;

let db: PGlite;

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec(supabaseStubs);
  await db.exec(schema);
  await db.exec(fixtures);
}, 60_000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback; reset role;");
});

type Actor = (typeof U)[keyof typeof U] | "anon" | "service";

/** Switches to the role Supabase would use for this actor (JWT sub for users). */
async function actAs(actor: Actor) {
  const role = actor === "anon" ? "anon" : actor === "service" ? "service_role" : "authenticated";
  const sub = actor === "anon" || actor === "service" ? "" : actor;
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub', '${sub}', true); set local role ${role};`,
  );
}

const rows = async <T = Record<string, unknown>>(sql: string) => (await db.query<T>(sql)).rows;
const affected = async (sql: string) => (await db.query(sql)).affectedRows ?? 0;

/** Runs a statement that must fail, inside a savepoint so the test can go on. */
async function rejects(sql: string, message: RegExp) {
  await db.exec("savepoint attempt");
  try {
    await db.query(sql);
  } catch (error) {
    await db.exec("rollback to savepoint attempt");
    expect((error as Error).message).toMatch(message);
    return;
  }
  throw new Error(`expected to fail: ${sql}`);
}

describe("schema", () => {
  it("enables RLS on every public table", async () => {
    const withoutRls = await rows(`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity`);
    expect(withoutRls).toEqual([]);
  });

  it("never lets a card be active without a client", async () => {
    await rejects(
      `update public.cards set status = 'ACTIVE' where id = '${CARD_FREE}'`,
      /cards_assignment_check/,
    );
  });
});

describe("organization isolation", () => {
  it("shows an owner only their own organization's data", async () => {
    await actAs(U.ownerA);
    expect(await rows("select id from public.cards")).toEqual([{ id: CARD_A }]);
    expect(await rows("select 1 from public.tap_events")).toHaveLength(1);
    expect(await rows("select 1 from public.organizations")).toHaveLength(1);
    expect(await rows("select 1 from public.payments")).toHaveLength(0);
    expect(await rows("select 1 from public.card_batches")).toHaveLength(0);
    const emails = (await rows<{ email: string }>("select email from public.users order by email")).map(
      (r) => r.email,
    );
    expect(emails).toEqual(["manager@a.kz", "owner@a.kz", "viewer@a.kz"]);
  });

  it("does not let an owner change another organization's card", async () => {
    await actAs(U.ownerA);
    expect(await affected(`update public.cards set label = 'x' where id = '${CARD_B}'`)).toBe(0);
  });

  it("rejects references to another organization's rows", async () => {
    await actAs(U.managerA);
    await rejects(`update public.cards set location_id = '${LOC_B}' where id = '${CARD_A}'`, /foreign key/);
    await rejects(
      `insert into public.employees (organization_id, name) values ('${ORG_B}', 'Шпион')`,
      /row-level security/,
    );
  });

  it("gives anonymous requests nothing", async () => {
    await actAs("anon");
    expect(await rows("select 1 from public.organizations")).toHaveLength(0);
    expect(await rows("select 1 from public.cards")).toHaveLength(0);
    await rejects(
      `insert into public.leads (name, phone, business_name) values ('a', '+77010000000', 'b')`,
      /row-level security/,
    );
  });

  it("cuts a blocked user off immediately", async () => {
    await db.exec(`update public.users set status = 'BLOCKED' where id = '${U.managerA}'`);
    await actAs(U.managerA);
    expect(await rows("select 1 from public.cards")).toHaveLength(0);
  });
});

describe("client roles", () => {
  it("lets a viewer read but not change cards", async () => {
    await actAs(U.viewerA);
    expect(await rows("select 1 from public.cards")).toHaveLength(1);
    expect(await affected(`update public.cards set label = 'x' where id = '${CARD_A}'`)).toBe(0);
  });

  it("lets a manager relabel, pause and report a card lost — and nothing more", async () => {
    await actAs(U.managerA);
    expect(
      await affected(`update public.cards set label = 'Стол 1', status = 'PAUSED' where id = '${CARD_A}'`),
    ).toBe(1);
    await rejects(`update public.cards set status = 'REVOKED' where id = '${CARD_A}'`, /managed by TapToGo/);
    await rejects(
      `update public.cards set organization_id = '${ORG_B}' where id = '${CARD_A}'`,
      /managed by TapToGo/,
    );
    await rejects(
      `update public.cards set target_id = '${TARGET_A_UNVERIFIED}' where id = '${CARD_A}'`,
      /verified/,
    );
    expect(await affected(`update public.cards set status = 'LOST' where id = '${CARD_A}'`)).toBe(1);
    await rejects(`update public.cards set status = 'ACTIVE' where id = '${CARD_A}'`, /locked/);
  });

  it("lets an owner edit organization details but not its status", async () => {
    await actAs(U.ownerA);
    expect(await affected(`update public.organizations set name = 'A2' where id = '${ORG_A}'`)).toBe(1);
    await rejects(
      `update public.organizations set status = 'ARCHIVED' where id = '${ORG_A}'`,
      /managed by TapToGo/,
    );
  });

  it("lets users edit only their own name and phone", async () => {
    await actAs(U.ownerA);
    expect(await affected(`update public.users set name = 'Новое' where id = '${U.ownerA}'`)).toBe(1);
    expect(await affected(`update public.users set name = 'x' where id = '${U.viewerA}'`)).toBe(0);
    await rejects(
      `update public.users set platform_role = 'SUPER_ADMIN' where id = '${U.ownerA}'`,
      /only name and phone/,
    );
  });

  it("keeps at least one owner in every organization", async () => {
    await actAs(U.ownerA);
    await rejects(
      `delete from public.memberships where user_id = '${U.ownerA}' and organization_id = '${ORG_A}'`,
      /last owner/,
    );
    expect(await affected(`delete from public.memberships where user_id = '${U.viewerA}'`)).toBe(1);
  });
});

describe("platform roles", () => {
  it("lets support see everything and change only card status", async () => {
    await actAs(U.support);
    expect(await rows("select 1 from public.cards")).toHaveLength(3);
    expect(await affected(`update public.cards set status = 'PAUSED' where id = '${CARD_A}'`)).toBe(1);
    await rejects(`update public.cards set label = 'x' where id = '${CARD_A}'`, /only the status/);
    await rejects(
      `insert into public.card_batches (name, quantity, card_type) values ('x', 1, 'STICKER')`,
      /row-level security/,
    );
    await rejects(
      `insert into public.payments (organization_id, amount_kzt, paid_at, method, recorded_by_id)
       values ('${ORG_A}', 1, now(), 'CASH', '${U.support}')`,
      /row-level security/,
    );
  });

  it("lets an admin assign cards but not touch staff or platform settings", async () => {
    await actAs(U.admin);
    expect(
      await affected(
        `update public.cards set status = 'ACTIVE', organization_id = '${ORG_B}', target_id = '${TARGET_B}'
         where id = '${CARD_FREE}'`,
      ),
    ).toBe(1);
    expect(await affected("update public.platform_settings set grace_days = 1")).toBe(0);
    expect(await affected(`update public.users set platform_role = 'ADMIN' where id = '${U.support}'`)).toBe(
      0,
    );
  });

  it("lets a super admin manage staff and platform settings", async () => {
    await actAs(U.superAdmin);
    expect(await affected("update public.platform_settings set grace_days = 5")).toBe(1);
    expect(await affected(`update public.users set platform_role = 'ADMIN' where id = '${U.support}'`)).toBe(
      1,
    );
  });
});

describe("audit log", () => {
  it("accepts entries only on one's own behalf", async () => {
    await actAs(U.ownerA);
    expect(
      await affected(
        `insert into public.audit_logs (actor_user_id, action, entity_type) values ('${U.ownerA}', 'card.update', 'card')`,
      ),
    ).toBe(1);
    await rejects(
      `insert into public.audit_logs (actor_user_id, action, entity_type) values ('${U.admin}', 'card.update', 'card')`,
      /row-level security/,
    );
  });

  it("is append-only for every role, service role included", async () => {
    await db.exec(
      `insert into public.audit_logs (actor_user_id, action, entity_type) values (null, 'system.test', 'system')`,
    );
    await actAs(U.superAdmin);
    await rejects("update public.audit_logs set action = 'x.y'", /permission denied/);
    await actAs("service");
    await rejects("delete from public.audit_logs", /permission denied|append-only/);
  });
});

describe("server-only functions and storage", () => {
  it("adds up daily stats atomically, for the service role only", async () => {
    await actAs("service");
    await db.query(
      `select public.increment_daily_card_stat('${CARD_B}', current_date, '${ORG_B}', null, null, 1, 1, 1, 0)`,
    );
    await db.query(
      `select public.increment_daily_card_stat('${CARD_B}', current_date, '${ORG_B}', null, null, 2, 0, 1, 1)`,
    );
    expect(
      await rows(
        `select taps, unique_visitors, nfc_taps, qr_taps from public.daily_card_stats where card_id = '${CARD_B}' and date = current_date`,
      ),
    ).toEqual([{ taps: 3, unique_visitors: 1, nfc_taps: 2, qr_taps: 1 }]);

    await actAs(U.ownerA);
    await rejects(
      `select public.increment_daily_card_stat('${CARD_A}', current_date, '${ORG_A}', null, null, 1, 1, 1, 0)`,
      /permission denied/,
    );
  });

  it("keeps logos inside the owner's organization folder", async () => {
    await actAs(U.ownerA);
    expect(
      await affected(`insert into storage.objects (bucket_id, name) values ('logos', '${ORG_A}/logo.png')`),
    ).toBe(1);
    await rejects(
      `insert into storage.objects (bucket_id, name) values ('logos', '${ORG_B}/logo.png')`,
      /row-level security/,
    );
    await actAs(U.ownerB);
    expect(await rows("select 1 from storage.objects")).toHaveLength(0);
  });
});

describe("repository functions", () => {
  it("sums daily stats in the database, grouped or not, within RLS", async () => {
    await actAs(U.ownerA);
    const total = await rows<{ key: string | null; taps: number }>(
      "select key, taps::int from public.daily_stat_totals('2026-10-01', '2026-10-31')",
    );
    // Only organization A's rows are visible to its owner: 5 + 3, not B's 7.
    expect(total).toEqual([{ key: null, taps: 8 }]);
    const byDate = await rows<{ key: string; taps: number }>(
      "select key, taps::int from public.daily_stat_totals('2026-10-01', '2026-10-31', 'date')",
    );
    expect(byDate).toEqual([
      { key: "2026-10-16", taps: 5 },
      { key: "2026-10-17", taps: 3 },
    ]);
    await rejects(
      "select * from public.daily_stat_totals('2026-10-01', '2026-10-31', 'evil')",
      /unknown dimension/,
    );
  });

  it("assigns cards atomically: a card already handed out is refused, the limit holds", async () => {
    await actAs(U.admin);
    const assign = (org: string, limit: string) =>
      rows<{ result: string }>(
        `select public.assign_cards(array['${CARD_FREE}']::uuid[], '${org}', null, null, now(), ${limit}) as result`,
      );
    expect(await assign(ORG_A, "1")).toEqual([{ result: "LIMIT_EXCEEDED" }]);
    expect(await assign(ORG_A, "null")).toEqual([{ result: "OK" }]);
    expect(await assign(ORG_B, "null")).toEqual([{ result: "NOT_UNASSIGNED" }]);
    expect(await rows(`select organization_id from public.cards where id = '${CARD_FREE}'`)).toEqual([
      { organization_id: ORG_A },
    ]);
  });

  it("does not let a client assign cards to itself", async () => {
    await actAs(U.ownerA);
    expect(
      await rows<{ result: string }>(
        `select public.assign_cards(array['${CARD_FREE}']::uuid[], '${ORG_A}', null, null, now(), null) as result`,
      ),
    ).toEqual([{ result: "NOT_FOUND" }]); // RLS hides unassigned cards from clients
  });

  it("creates a batch with numbered cards, or nothing when a code is taken", async () => {
    await actAs(U.admin);
    const create = (codes: string[]) =>
      `select public.create_batch_with_cards('Партия', 'STICKER', null,
         array[${codes.map((c) => `'${c}'`).join(", ")}], array[${codes.map(() => "'Стикер'").join(", ")}])`;
    await rejects(create(["NewCode1", "AAAAaaa1"]), /duplicate key|unique/);
    expect(await rows("select 1 from public.cards where code = 'NewCode1'")).toHaveLength(0);

    await db.query(create(["NewCode1", "NewCode2"]));
    expect(
      await rows("select code, number from public.cards where code like 'NewCode%' order by number"),
    ).toEqual([
      { code: "NewCode1", number: 1 },
      { code: "NewCode2", number: 2 },
    ]);
  });

  it("creates a client with locations, a verified target and a subscription in one go", async () => {
    await actAs(U.admin);
    const [{ id }] = (await rows<{ id: string }>(`select public.create_client(
      '{"name": "Новый", "contactName": "Тест", "contactPhone": "+77010000009", "contactEmail": "n@n.kz"}',
      '[{"name": "Точка", "address": "Алматы", "twogisFirmId": "70000001234567", "reviewsTargetUrl": "https://2gis.kz/r"},
        {"name": "Вторая", "address": "Астана"}]',
      '{"plan": "START", "cardLimit": 10, "paidUntil": "2026-11-17", "status": "TRIAL"}'
    ) as id`)) as [{ id: string }];
    expect(await rows(`select 1 from public.locations where organization_id = '${id}'`)).toHaveLength(2);
    expect(
      await rows(`select is_verified from public.redirect_targets where organization_id = '${id}'`),
    ).toEqual([{ is_verified: true }]);

    // A bad subscription rolls back the organization too.
    const before = await rows("select 1 from public.organizations");
    await rejects(
      `select public.create_client('{"name": "X", "contactName": "X", "contactPhone": "+77010000008",
        "contactEmail": "x@x.kz"}', '[]', '{"plan": "NOPE", "cardLimit": 1, "paidUntil": "2026-11-17", "status": "TRIAL"}')`,
      /invalid input value for enum/,
    );
    expect(await rows("select 1 from public.organizations")).toHaveLength(before.length);
  });

  it("keeps the card with its client when an employee is deleted", async () => {
    await db.exec(`
      insert into public.employees (id, organization_id, name) values ('${uuid(701)}', '${ORG_A}', 'Айгерим');
      update public.cards set employee_id = '${uuid(701)}' where id = '${CARD_A}';
      delete from public.employees where id = '${uuid(701)}';`);
    expect(
      await rows(`select organization_id, employee_id from public.cards where id = '${CARD_A}'`),
    ).toEqual([{ organization_id: ORG_A, employee_id: null }]);
  });

  it("allows each number only once per batch", async () => {
    await rejects(
      `insert into public.cards (code, batch_id, number, label, type) values ('Dupl1cat', '${BATCH}', 1, 'x', 'STICKER')`,
      /duplicate key|unique/,
    );
  });
});
