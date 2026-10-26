-- =============================================================================
-- TapToGo — ЧЕРНОВИК схемы Supabase (Postgres 15+).
--
-- НЕ ВЫПОЛНЯТЬ на проекте как есть. Это проектный документ: перед запуском его нужно
-- пройти по шагам docs/SUPABASE_MIGRATION.md, разбить на миграции
-- (supabase/migrations/*.sql) и проверить на staging-проекте.
-- Синтаксис и политики автоматически проверяет tests/schema/rls.test.ts
-- (PGlite + заглушка auth) в составе `pnpm test`.
--
-- Соответствие коду:
--   * таблицы и поля — это Zod-схемы из src/features/*/schemas.ts,
--     camelCase в коде → snake_case здесь (organizationId → organization_id);
--   * enum-типы повторяют массивы `as const` из тех же файлов;
--   * CHECK-ограничения повторяют Zod (длины строк, форматы) — БД остаётся
--     последней линией защиты, если какой-то путь обойдёт валидацию.
--
-- Модель доступа (подробно — в разделе «RLS» ниже):
--   * anon        — ничего. Публичные операции (редирект /t/{code}, заявка
--                   с лендинга, принятие приглашения) сервер выполняет
--                   service-ключом после своих проверок.
--   * authenticated — запросы от имени пользователя (клиентский ключ + JWT
--                   из cookie). RLS пускает только к своим организациям;
--                   сотрудники платформы видят всё, меняют — по роли.
--   * service_role — только на сервере: редирект и запись касаний, cron
--                   (синхронизация 2ГИС, письма), Auth Admin API. Обходит RLS,
--                   поэтому вызывается только после проверок в сервисах.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Перечисления
-- -----------------------------------------------------------------------------

create type public.platform_role       as enum ('ADMIN');
create type public.user_status         as enum ('ACTIVE', 'BLOCKED', 'PENDING');
create type public.org_role            as enum ('OWNER', 'MANAGER');
create type public.organization_status as enum ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
create type public.redirect_target_type as enum ('TWOGIS_REVIEW', 'TWOGIS_PROFILE', 'GOOGLE_MAPS', 'CUSTOM');
create type public.card_type           as enum ('NFC_CARD', 'STICKER', 'STAND', 'QR_ONLY');
create type public.card_status         as enum ('UNASSIGNED', 'ACTIVE', 'PAUSED', 'LOST', 'REVOKED');
create type public.tap_source          as enum ('NFC', 'QR');
create type public.device_type         as enum ('MOBILE', 'TABLET', 'DESKTOP', 'UNKNOWN');
create type public.operating_system    as enum ('IOS', 'ANDROID', 'WINDOWS', 'MACOS', 'LINUX', 'OTHER');
create type public.ticket_status       as enum ('NEW', 'IN_PROGRESS', 'CLOSED');
create type public.comment_subject     as enum ('TICKET');


-- -----------------------------------------------------------------------------
-- Пользователи и доступ
-- -----------------------------------------------------------------------------

-- Профиль поверх auth.users (пароли, сессии и подтверждение email — в Supabase Auth).
create table public.users (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text not null unique check (email = lower(email) and char_length(email) <= 254),
  name           text not null check (char_length(name) between 1 and 120),
  phone          text check (phone ~ '^\+7[0-9]{10}$'),
  -- null у клиентов; задан только у сотрудников TapToGo.
  platform_role  public.platform_role,
  status         public.user_status not null default 'ACTIVE',
  totp_enabled   boolean not null default false,
  -- Выставляет администратор при выдаче временного пароля; пока true, кабинет
  -- и админка недоступны до смены пароля (проверяет приложение, см. session.ts).
  must_change_password boolean not null default false,
  last_login_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index users_platform_role_idx on public.users (platform_role) where platform_role is not null;

create table public.organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 120),
  -- Контактное лицо необязательно: для работы нужны только название и адрес филиала.
  contact_name   text check (char_length(contact_name) between 1 and 120),
  contact_phone  text check (contact_phone ~ '^\+7[0-9]{10}$'),
  contact_email  text check (char_length(contact_email) <= 254),
  timezone       text not null default 'Asia/Almaty',
  status         public.organization_status not null default 'ACTIVE',
  created_at     timestamptz not null default now()
);

create table public.memberships (
  user_id         uuid not null references public.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role            public.org_role not null,
  created_at      timestamptz not null default now(),
  primary key (user_id, organization_id)
);
create index memberships_organization_id_idx on public.memberships (organization_id);

-- Сам токен приглашения не хранится — только SHA-256 (как в моке).
create table public.invitations (
  id              uuid primary key default gen_random_uuid(),
  email           text not null check (email = lower(email) and char_length(email) <= 254),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  role            public.org_role not null,
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by_id   uuid references public.users (id) on delete set null,
  expires_at      timestamptz not null,
  accepted_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index invitations_organization_id_idx on public.invitations (organization_id);

-- Просмотр кабинета клиента сотрудником платформы (только чтение, 30 минут).
-- В моке это поле сессии; в Supabase сессией владеет Auth, поэтому — таблица,
-- привязанная к session_id из JWT.
create table public.impersonation_sessions (
  id              uuid primary key default gen_random_uuid(),
  staff_user_id   uuid not null references public.users (id) on delete cascade,
  auth_session_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  started_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  ended_at        timestamptz,
  check (expires_at > started_at)
);
create index impersonation_sessions_active_idx
  on public.impersonation_sessions (auth_session_id) where ended_at is null;



-- -----------------------------------------------------------------------------
-- Филиалы, сотрудники, цели редиректа
--
-- У таблиц арендатора есть UNIQUE (id, organization_id), чтобы ссылки на них
-- были составными: (location_id, organization_id) → locations. Тогда карточка
-- или сотрудник физически не может сослаться на филиал чужой организации,
-- даже если ошибётся сервис. (MATCH SIMPLE: при null в любом столбце проверка
-- пропускается — это и нужно для необязательных ссылок.)
-- -----------------------------------------------------------------------------

create table public.locations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations (id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 120),
  address            text not null check (char_length(address) between 1 and 300),
  twogis_firm_id     text check (twogis_firm_id ~ '^[0-9]{5,20}$'),
  twogis_profile_url text check (twogis_profile_url like 'https://%' and char_length(twogis_profile_url) <= 2048),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (id, organization_id)
);
create index locations_organization_id_idx on public.locations (organization_id);

create table public.employees (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id     uuid,
  name            text not null check (char_length(name) between 1 and 120),
  position        text check (char_length(position) <= 120),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (location_id, organization_id) references public.locations (id, organization_id)
);
create index employees_organization_id_idx on public.employees (organization_id);

-- URL проверяется приложением по allowlist доменов (platform_settings) и при
-- сохранении, и при каждом редиректе; здесь — только https и длина.
create table public.redirect_targets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id     uuid,
  type            public.redirect_target_type not null,
  url             text not null check (url like 'https://%' and char_length(url) <= 2048),
  is_verified     boolean not null default false,
  created_at      timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (location_id, organization_id) references public.locations (id, organization_id)
);
create index redirect_targets_organization_id_idx on public.redirect_targets (organization_id);

-- Публичные цифры 2ГИС раз в сутки. Тексты отзывов не хранятся.
create table public.rating_snapshots (
  id           uuid primary key default gen_random_uuid(),
  location_id  uuid not null references public.locations (id) on delete cascade,
  captured_at  timestamptz not null,
  rating       numeric(3, 2) check (rating between 0 and 5),
  review_count integer check (review_count >= 0)
);
create index rating_snapshots_location_captured_idx on public.rating_snapshots (location_id, captured_at desc);


-- -----------------------------------------------------------------------------
-- Карточки
-- -----------------------------------------------------------------------------

create table public.card_batches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 120),
  quantity   integer not null check (quantity between 1 and 2000),
  card_type  public.card_type not null,
  notes      text check (char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create table public.cards (
  id              uuid primary key default gen_random_uuid(),
  -- 8 символов base62, генерируется криптостойко (src/features/cards/code.ts).
  -- Регистр значим: COLLATE "C" делает и уникальность, и поиск побайтовыми.
  code            text collate "C" not null unique check (code ~ '^[A-Za-z0-9]{8}$'),
  batch_id        uuid not null references public.card_batches (id),
  -- Номер в партии (1…quantity): печатается рядом с кодом, по нему назначают диапазоны.
  -- Хранится, а не вычисляется по порядку строк: порядок в SQL не гарантирован.
  number          integer not null check (number between 1 and 2000),
  organization_id uuid references public.organizations (id),
  location_id     uuid,
  employee_id     uuid,
  target_id       uuid,
  label           text not null check (char_length(label) between 1 and 80),
  type            public.card_type not null,
  status          public.card_status not null default 'UNASSIGNED',
  nfc_written     boolean not null default false,
  nfc_locked      boolean not null default false,
  activated_at    timestamptz,
  created_at      timestamptz not null default now(),
  -- Клиент появляется у карточки только через назначение, и наоборот.
  constraint cards_assignment_check check ((status = 'UNASSIGNED') = (organization_id is null)),
  foreign key (location_id, organization_id) references public.locations (id, organization_id),
  -- Удаление сотрудника обнуляет только employee_id (PG 15+): без списка
  -- столбцов SET NULL обнулил бы и organization_id, отвязав карточку от клиента.
  foreign key (employee_id, organization_id) references public.employees (id, organization_id)
    on delete set null (employee_id),
  foreign key (target_id, organization_id)   references public.redirect_targets (id, organization_id),
  unique (batch_id, number)
);
create index cards_organization_id_idx on public.cards (organization_id);
create index cards_location_id_idx     on public.cards (location_id) where location_id is not null;
create index cards_employee_id_idx     on public.cards (employee_id) where employee_id is not null;
create index cards_target_id_idx       on public.cards (target_id) where target_id is not null;

-- Касания. Нет IP, User-Agent и идентификатора посетителя — только грубые
-- признаки устройства и флаги бота/дубля. Боты и дубли хранятся для
-- прозрачности, но в статистику не идут.
--
-- ПАРТИЦИОНИРОВАНИЕ. Это самая быстрорастущая таблица (каждое касание).
-- Первичный ключ уже включает occurred_at, чтобы позже перейти на
--   create table public.tap_events (...) partition by range (occurred_at);
-- с помесячными партициями через pg_partman без смены ключа. Переходить
-- имеет смысл при ~10–20 млн строк или когда запросы дашборда за 90 дней
-- перестанут укладываться в индекс. Старые партиции (старше 13 месяцев)
-- можно отсоединять и архивировать: графики строятся по daily_card_stats,
-- а сырые события нужны только тепловой карте и разбивкам за период.
create table public.tap_events (
  id              uuid not null,
  card_id         uuid not null references public.cards (id),
  organization_id uuid not null references public.organizations (id),
  location_id     uuid,
  employee_id     uuid,
  occurred_at     timestamptz not null,
  source          public.tap_source not null,
  device_type     public.device_type not null,
  os              public.operating_system not null,
  is_bot          boolean not null default false,
  is_duplicate    boolean not null default false,
  -- id генерирует сервер до записи: повторная запись того же события
  -- (ретрай) не создаёт дубль — insert ... on conflict do nothing.
  primary key (id, occurred_at)
);
create index tap_events_org_occurred_idx  on public.tap_events (organization_id, occurred_at);
create index tap_events_card_occurred_idx on public.tap_events (card_id, occurred_at);

-- Суточная сводка по карточке (дата — по часовому поясу организации).
-- Только валидные касания: без ботов и дублей.
-- location_id / employee_id фиксируются первым касанием за день, как в моке.
create table public.daily_card_stats (
  card_id         uuid not null references public.cards (id),
  date            date not null,
  organization_id uuid not null references public.organizations (id),
  location_id     uuid,
  employee_id     uuid,
  taps            integer not null default 0 check (taps >= 0),
  unique_visitors integer not null default 0 check (unique_visitors >= 0),
  nfc_taps        integer not null default 0 check (nfc_taps >= 0),
  qr_taps         integer not null default 0 check (qr_taps >= 0),
  primary key (card_id, date),
  check (nfc_taps + qr_taps = taps)
);
create index daily_card_stats_org_date_idx on public.daily_card_stats (organization_id, date);


-- -----------------------------------------------------------------------------
-- Обращения и внутренние комментарии
-- -----------------------------------------------------------------------------

create table public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author_id       uuid not null references public.users (id),
  subject         text not null check (char_length(subject) between 1 and 200),
  body            text not null check (char_length(body) between 1 and 5000),
  status          public.ticket_status not null default 'NEW',
  assignee_id     uuid references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index support_tickets_organization_idx on public.support_tickets (organization_id, created_at desc);
create index support_tickets_status_idx       on public.support_tickets (status) where status <> 'CLOSED';

-- Covering indexes for foreign keys (deletes/updates of the referenced row scan these).
create index employees_location_id_idx on public.employees (location_id) where location_id is not null;
create index redirect_targets_location_id_idx on public.redirect_targets (location_id) where location_id is not null;
create index impersonation_sessions_organization_id_idx on public.impersonation_sessions (organization_id);
create index impersonation_sessions_staff_user_id_idx on public.impersonation_sessions (staff_user_id);
create index invitations_invited_by_id_idx on public.invitations (invited_by_id);
create index support_tickets_assignee_id_idx on public.support_tickets (assignee_id) where assignee_id is not null;
create index support_tickets_author_id_idx on public.support_tickets (author_id);

-- Заметки сотрудников по обращениям; клиент их никогда не видит.
-- subject_id полиморфный (тип темы в subject_type), поэтому без внешнего ключа.
create table public.internal_comments (
  id           uuid primary key default gen_random_uuid(),
  subject_type public.comment_subject not null,
  subject_id   uuid not null,
  author_id    uuid not null references public.users (id),
  body         text not null check (char_length(body) between 1 and 2000),
  created_at   timestamptz not null default now()
);
create index internal_comments_subject_idx on public.internal_comments (subject_type, subject_id, created_at);
create index internal_comments_author_id_idx on public.internal_comments (author_id);


-- -----------------------------------------------------------------------------
-- Журнал и настройки платформы
-- -----------------------------------------------------------------------------

-- Только вставка: ни UPDATE, ни DELETE ни для одной роли (см. ниже права,
-- политики и триггер). Пишется сервисом AuditService, не вручную.
create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  -- null — системные действия (cron, автоматическая смена статуса).
  actor_user_id   uuid references public.users (id) on delete set null,
  action          text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$' and char_length(action) <= 64),
  entity_type     text not null check (char_length(entity_type) <= 40),
  entity_id       text check (char_length(entity_id) <= 64),
  organization_id uuid references public.organizations (id) on delete set null,
  before          jsonb,
  after           jsonb,
  created_at      timestamptz not null default now()
);
create index audit_logs_created_idx      on public.audit_logs (created_at desc);
create index audit_logs_organization_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_actor_idx        on public.audit_logs (actor_user_id, created_at desc);
create index audit_logs_entity_idx       on public.audit_logs (entity_type, entity_id);

-- Одна строка: настройки платформы.
create table public.platform_settings (
  id                       boolean primary key default true check (id),
  allowed_redirect_domains text[] not null check (cardinality(allowed_redirect_domains) between 1 and 50)
);
insert into public.platform_settings (allowed_redirect_domains) values (
  array['2gis.kz', '2gis.ru', 'go.2gis.com', 'google.com', 'maps.app.goo.gl', 'g.page']
);


-- =============================================================================
-- Функции-помощники для RLS
--
-- Лежат в схеме private: PostgREST её не публикует, вызвать их через API
-- нельзя, но политики могут. SECURITY DEFINER — чтобы проверка membership
-- не упиралась в RLS самой таблицы memberships (иначе рекурсия политик).
-- search_path = '' и полные имена — защита от подмены объектов.
-- Заблокированный пользователь (status <> 'ACTIVE') теряет доступ сразу,
-- не дожидаясь истечения JWT.
-- =============================================================================

create schema if not exists private;
grant usage on schema private to authenticated;

-- Администратор TapToGo: единственная роль платформы. Заблокированный
-- администратор доступ теряет сразу.
create function private.is_platform_admin()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid()) and u.status = 'ACTIVE' and u.platform_role = 'ADMIN'
  )
$$;

-- Текущий пользователь состоит в организации (любая роль).
create function private.is_org_member(org_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.users u on u.id = m.user_id
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
      and u.status = 'ACTIVE'
  )
$$;

-- Текущий пользователь состоит в организации с одной из ролей.
create function private.has_org_role(org_id uuid, roles public.org_role[])
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.users u on u.id = m.user_id
    where m.organization_id = org_id
      and m.user_id = (select auth.uid())
      and u.status = 'ACTIVE'
      and m.role = any (roles)
  )
$$;

-- Пользователь other_user состоит хотя бы в одной общей организации с текущим
-- (экран «Команда» показывает имена и email коллег).
create function private.shares_org_with(other_user uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = other_user
  )
$$;

-- По умолчанию функции исполняемы для PUBLIC (включая anon) — закрываем.
revoke execute on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;


-- =============================================================================
-- Row Level Security
--
-- Включена на ВСЕХ таблицах. Политик для anon нет вообще. Права ролей — по
-- матрице src/server/permissions.ts (UI и сервер проверяют то же самое; RLS —
-- вторая линия обороны на случай ошибки в коде):
--
--   Действие                         ADMIN  OWNER  MANAGER
--   Админ-панель, чтение и запись      ✓      —      —
--   Статус карточки (пауза/потеря)     ✓      ✓      ✓
--   Дашборд, отчёты своей организации  —      ✓      ✓
--   Карточки, сотрудники (запись)      —      ✓      ✓
--   Команда, данные организации        —      ✓      —
--
-- Просмотр кабинета сотрудником платформы отдельных политик не требует:
-- читать он может и так (is_platform_admin), а писать в данные клиента ему
-- RLS не даёт — он не член организации. Запрет записи во время просмотра
-- дублируется в приложении (runOrgAction).
--
-- Политики, где важна скорость, оборачивают вызовы в (select ...): Postgres
-- вычисляет их один раз на запрос, а не на каждую строку.
-- =============================================================================

alter table public.users                  enable row level security;
alter table public.organizations          enable row level security;
alter table public.memberships            enable row level security;
alter table public.invitations            enable row level security;
alter table public.impersonation_sessions enable row level security;
alter table public.locations              enable row level security;
alter table public.employees              enable row level security;
alter table public.redirect_targets       enable row level security;
alter table public.rating_snapshots       enable row level security;
alter table public.card_batches           enable row level security;
alter table public.cards                  enable row level security;
alter table public.tap_events             enable row level security;
alter table public.daily_card_stats       enable row level security;
alter table public.support_tickets        enable row level security;
alter table public.internal_comments      enable row level security;
alter table public.audit_logs             enable row level security;
alter table public.platform_settings      enable row level security;


-- users -----------------------------------------------------------------------
-- Видно: себя; коллег по организациям; всем сотрудникам платформы.
-- Меняет: сам себя (только name, phone — остальное режет триггер ниже);
-- администратор — статусы сотрудников платформы. Создание — только через Auth
-- Admin API (service_role): приглашение клиента, новый сотрудник платформы.
create policy users_select on public.users for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_platform_admin())
    or private.shares_org_with(id)
  );
create policy users_update_self on public.users for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
create policy users_update_staff on public.users for update to authenticated
  using ((select private.is_platform_admin()) and platform_role is not null)
  with check ((select private.is_platform_admin()) and platform_role is not null);

-- organizations ---------------------------------------------------------------
-- Видно: членам и сотрудникам платформы. Создаёт: администратор (мастер клиента).
-- Меняет: OWNER (реквизиты) и администратор (всё, включая статус —
-- смену статуса владельцем запрещает триггер). Удаления нет: архив.
create policy organizations_select on public.organizations for select to authenticated
  using (private.is_org_member(id) or (select private.is_platform_admin()));
create policy organizations_insert on public.organizations for insert to authenticated
  with check ((select private.is_platform_admin()));
create policy organizations_update on public.organizations for update to authenticated
  using (private.has_org_role(id, '{OWNER}') or (select private.is_platform_admin()))
  with check (private.has_org_role(id, '{OWNER}') or (select private.is_platform_admin()));

-- memberships -----------------------------------------------------------------
-- Видно: членам той же организации и сотрудникам. Создаёт membership только
-- принятие приглашения (service_role) и мастер клиента (администратор).
-- Роль меняет и участника удаляет OWNER или администратор; последнего OWNER убрать
-- нельзя — проверяет триггер.
create policy memberships_select on public.memberships for select to authenticated
  using (private.is_org_member(organization_id) or (select private.is_platform_admin()));
create policy memberships_insert on public.memberships for insert to authenticated
  with check ((select private.is_platform_admin()));
create policy memberships_update on public.memberships for update to authenticated
  using (private.has_org_role(organization_id, '{OWNER}') or (select private.is_platform_admin()))
  with check (private.has_org_role(organization_id, '{OWNER}') or (select private.is_platform_admin()));
create policy memberships_delete on public.memberships for delete to authenticated
  using (private.has_org_role(organization_id, '{OWNER}') or (select private.is_platform_admin()));

-- invitations -----------------------------------------------------------------
-- OWNER своей организации и администратор. Поиск по токену и принятие —
-- service_role (у приглашённого ещё нет доступа к организации).
create policy invitations_select on public.invitations for select to authenticated
  using (private.has_org_role(organization_id, '{OWNER}') or (select private.is_platform_admin()));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (private.has_org_role(organization_id, '{OWNER}') or (select private.is_platform_admin()));
create policy invitations_delete on public.invitations for delete to authenticated
  using (private.has_org_role(organization_id, '{OWNER}') or (select private.is_platform_admin()));

-- impersonation_sessions ------------------------------------------------------
-- Администратор видит и завершает свои просмотры; журнал просмотров видят все администраторы.
-- (Сам факт просмотра ещё и пишется в audit_logs.)
create policy impersonation_select on public.impersonation_sessions for select to authenticated
  using (staff_user_id = (select auth.uid()) or (select private.is_platform_admin()));
create policy impersonation_insert on public.impersonation_sessions for insert to authenticated
  with check (staff_user_id = (select auth.uid()) and (select private.is_platform_admin()));
create policy impersonation_update on public.impersonation_sessions for update to authenticated
  using (staff_user_id = (select auth.uid()))
  with check (staff_user_id = (select auth.uid()));

-- locations, redirect_targets ---------------------------------------------------
-- Клиент только читает: изменить филиал или ссылку 2ГИС он просит через
-- обращение; цели (особенно CUSTOM) создаёт и подтверждает администратор.
create policy locations_select on public.locations for select to authenticated
  using (private.is_org_member(organization_id) or (select private.is_platform_admin()));
create policy locations_write on public.locations for all to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

create policy redirect_targets_select on public.redirect_targets for select to authenticated
  using (private.is_org_member(organization_id) or (select private.is_platform_admin()));
create policy redirect_targets_write on public.redirect_targets for all to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

-- employees -------------------------------------------------------------------
-- Читают все члены; добавляют, меняют и удаляют OWNER и MANAGER (и администратор).
create policy employees_select on public.employees for select to authenticated
  using (private.is_org_member(organization_id) or (select private.is_platform_admin()));
create policy employees_write on public.employees for all to authenticated
  using (private.has_org_role(organization_id, '{OWNER,MANAGER}') or (select private.is_platform_admin()))
  with check (private.has_org_role(organization_id, '{OWNER,MANAGER}') or (select private.is_platform_admin()));

-- rating_snapshots ------------------------------------------------------------
-- Читают члены организации филиала и сотрудники. Пишет ежедневный cron
-- (service_role) и ручная синхронизация администратор.
create policy rating_snapshots_select on public.rating_snapshots for select to authenticated
  using (
    (select private.is_platform_admin())
    or exists (
      select 1 from public.locations l
      where l.id = rating_snapshots.location_id and private.is_org_member(l.organization_id)
    )
  );
create policy rating_snapshots_insert on public.rating_snapshots for insert to authenticated
  with check ((select private.is_platform_admin()));

-- card_batches ------------------------------------------------------------------
-- Производство карточек — внутренняя кухня платформы, клиенту не видно.
create policy card_batches_select on public.card_batches for select to authenticated
  using ((select private.is_platform_admin()));
create policy card_batches_write on public.card_batches for all to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

-- cards -------------------------------------------------------------------------
-- Видно: членам организации карточки и сотрудникам (неназначенные — только
-- сотрудникам). Создаёт: администратор (партия). Меняют: OWNER/MANAGER и
-- администратор — какие поля и статусы кому можно, решает триггер guard_card_update.
-- Удаления нет: REVOKED.
create policy cards_select on public.cards for select to authenticated
  using (
    (organization_id is not null and private.is_org_member(organization_id))
    or (select private.is_platform_admin())
  );
create policy cards_insert on public.cards for insert to authenticated
  with check ((select private.is_platform_admin()));
create policy cards_update on public.cards for update to authenticated
  using (
    (organization_id is not null and private.has_org_role(organization_id, '{OWNER,MANAGER}'))
    or (select private.is_platform_admin())
  )
  with check (
    (organization_id is not null and private.has_org_role(organization_id, '{OWNER,MANAGER}'))
    or (select private.is_platform_admin())
  );

-- tap_events, daily_card_stats ------------------------------------------------
-- Только чтение для членов организации и сотрудников. Пишет только сервер
-- (редирект /t/{code} — анонимный запрос) через service_role и
-- функцию increment_daily_card_stat.
create policy tap_events_select on public.tap_events for select to authenticated
  using (private.is_org_member(organization_id) or (select private.is_platform_admin()));
create policy daily_card_stats_select on public.daily_card_stats for select to authenticated
  using (private.is_org_member(organization_id) or (select private.is_platform_admin()));

-- support_tickets ---------------------------------------------------------------
-- Клиент (любая роль) создаёт обращение от своего имени и видит обращения
-- своей организации. Статус и ответственного меняет администратор.
create policy support_tickets_select on public.support_tickets for select to authenticated
  using (private.is_org_member(organization_id) or (select private.is_platform_admin()));
create policy support_tickets_insert on public.support_tickets for insert to authenticated
  with check (author_id = (select auth.uid()) and private.is_org_member(organization_id));
create policy support_tickets_update on public.support_tickets for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

-- internal_comments -------------------------------------------------------------
-- Только сотрудники.
create policy internal_comments_select on public.internal_comments for select to authenticated
  using ((select private.is_platform_admin()));
create policy internal_comments_insert on public.internal_comments for insert to authenticated
  with check ((select private.is_platform_admin()) and author_id = (select auth.uid()));

-- audit_logs --------------------------------------------------------------------
-- Только вставка, и только от своего имени. Системные записи (actor = null)
-- и записи анонимных действий пишет service_role. Читают сотрудники.
-- UPDATE/DELETE политик нет, права отозваны, а триггер ниже не даст изменить
-- журнал даже service_role.
create policy audit_logs_select on public.audit_logs for select to authenticated
  using ((select private.is_platform_admin()));
create policy audit_logs_insert on public.audit_logs for insert to authenticated
  with check (actor_user_id = (select auth.uid()));

revoke update, delete, truncate on public.audit_logs from anon, authenticated, service_role;

-- platform_settings -------------------------------------------------------------
-- Читают все вошедшие (allowlist ссылок). Меняет администратор.
create policy platform_settings_select on public.platform_settings for select to authenticated
  using (true);
create policy platform_settings_update on public.platform_settings for update to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));


-- =============================================================================
-- Триггеры-охранники
--
-- RLS отвечает на вопрос «можно ли трогать строку», но не «какие столбцы».
-- Эти триггеры закрывают поля, которые роль менять не должна. Запросы
-- service_role (auth.uid() is null) они пропускают — сервер уже проверил права.
-- =============================================================================

-- Пользователь меняет у себя только name и phone; роль платформы, статус,
-- email и 2FA — только администратор (или сервер).
create function private.guard_user_update()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or private.is_platform_admin() then
    return new;
  end if;
  if new.email is distinct from old.email
     or new.platform_role is distinct from old.platform_role
     or new.status is distinct from old.status
     or new.totp_enabled is distinct from old.totp_enabled
     or new.must_change_password is distinct from old.must_change_password
     or new.last_login_at is distinct from old.last_login_at then
    raise exception 'users: only name and phone can be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger users_guard before update on public.users
  for each row execute function private.guard_user_update();

-- Статус организации (приостановка, архив) меняет только администратор.
create function private.guard_organization_update()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or private.is_platform_admin() then
    return new;
  end if;
  if new.status is distinct from old.status or new.timezone is distinct from old.timezone then
    raise exception 'organizations: status is managed by TapToGo' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger organizations_guard before update on public.organizations
  for each row execute function private.guard_organization_update();

-- Карточка:
--   администратор — любые изменения;
--   OWNER/MANAGER — название, филиал, сотрудник, цель и статус
--                   ACTIVE ↔ PAUSED или LOST, и только пока карточка
--                   ACTIVE/PAUSED (LOST/REVOKED возвращает администратор).
create function private.guard_card_update()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or private.is_platform_admin() then
    return new;
  end if;

  if new.code is distinct from old.code
     or new.batch_id is distinct from old.batch_id
     or new.organization_id is distinct from old.organization_id
     or new.type is distinct from old.type
     or new.nfc_written is distinct from old.nfc_written
     or new.nfc_locked is distinct from old.nfc_locked
     or new.activated_at is distinct from old.activated_at then
    raise exception 'cards: field is managed by TapToGo' using errcode = '42501';
  end if;

  if new.status is distinct from old.status
     and new.status not in ('ACTIVE', 'PAUSED', 'LOST') then
    raise exception 'cards: status % is managed by TapToGo', new.status using errcode = '42501';
  end if;

  -- Клиент.
  if old.status not in ('ACTIVE', 'PAUSED') then
    raise exception 'cards: card is % and locked for the client', old.status using errcode = '42501';
  end if;
  -- Цель обязана быть подтверждённой (составной FK уже гарантирует, что она своя).
  if new.target_id is distinct from old.target_id and new.target_id is not null
     and not exists (select 1 from public.redirect_targets t where t.id = new.target_id and t.is_verified) then
    raise exception 'cards: target must be verified' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger cards_guard before update on public.cards
  for each row execute function private.guard_card_update();

-- В организации всегда остаётся хотя бы один OWNER.
create function private.guard_last_owner()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'OWNER'
     and (tg_op = 'DELETE' or new.role <> 'OWNER')
     and not exists (
       select 1 from public.memberships m
       where m.organization_id = old.organization_id
         and m.role = 'OWNER'
         and m.user_id <> old.user_id
     )
     -- Удаление всей организации каскадом — не повод ругаться.
     and exists (select 1 from public.organizations o where o.id = old.organization_id) then
    raise exception 'memberships: the last owner cannot leave' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger memberships_last_owner before update or delete on public.memberships
  for each row execute function private.guard_last_owner();

-- Журнал неизменяем ни для кого.
create function private.forbid_audit_change()
returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;
create trigger audit_logs_append_only before update or delete on public.audit_logs
  for each row execute function private.forbid_audit_change();

create function private.touch_updated_at()
returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger support_tickets_touch before update on public.support_tickets
  for each row execute function private.touch_updated_at();


-- =============================================================================
-- Серверные функции (только service_role)
-- =============================================================================

-- Атомарное «+N» к суточной сводке — то, что делает
-- DailyCardStatRepository.increment в моке. Без функции два одновременных
-- касания одной карточки могли бы потерять инкремент.
create function public.increment_daily_card_stat(
  p_card_id uuid,
  p_date date,
  p_organization_id uuid,
  p_location_id uuid,
  p_employee_id uuid,
  p_taps integer,
  p_unique_visitors integer,
  p_nfc_taps integer,
  p_qr_taps integer
)
returns void
language sql security invoker set search_path = '' as $$
  insert into public.daily_card_stats as s
    (card_id, date, organization_id, location_id, employee_id, taps, unique_visitors, nfc_taps, qr_taps)
  values
    (p_card_id, p_date, p_organization_id, p_location_id, p_employee_id,
     p_taps, p_unique_visitors, p_nfc_taps, p_qr_taps)
  on conflict (card_id, date) do update set
    taps            = s.taps + excluded.taps,
    unique_visitors = s.unique_visitors + excluded.unique_visitors,
    nfc_taps        = s.nfc_taps + excluded.nfc_taps,
    qr_taps         = s.qr_taps + excluded.qr_taps
$$;
revoke execute on function public.increment_daily_card_stat from public, anon, authenticated;
grant execute on function public.increment_daily_card_stat to service_role;


-- =============================================================================
-- Функции репозиториев (SECURITY INVOKER: выполняются с правами вызывающего,
-- поэтому RLS и триггеры-охранники действуют как при обычных запросах).
-- Каждая — одна транзакция: то, что в моке делает один синхронный вызов.
-- =============================================================================

-- DailyCardStatRepository.total / totalsBy. Суммы считает БД: ответ растёт с
-- числом групп (дней, карточек), а не с числом хранимых строк — и не упирается
-- в лимит строк API (1000 по умолчанию). p_dimension = null → одна строка-итог.
create function public.daily_stat_totals(
  p_from date,
  p_to date,
  p_dimension text default null,
  p_organization_id uuid default null,
  p_card_ids uuid[] default null,
  p_location_id uuid default null,
  p_employee_id uuid default null
)
returns table (key text, taps bigint, unique_visitors bigint, nfc_taps bigint, qr_taps bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_dimension is not null
     and p_dimension not in ('date', 'cardId', 'locationId', 'employeeId', 'organizationId') then
    raise exception 'daily_stat_totals: unknown dimension %', p_dimension using errcode = '22023';
  end if;
  return query
    select g.key, g.taps, g.unique_visitors, g.nfc_taps, g.qr_taps
    from (
      select
        case p_dimension
          when 'date' then s.date::text
          when 'cardId' then s.card_id::text
          when 'locationId' then s.location_id::text
          when 'employeeId' then s.employee_id::text
          when 'organizationId' then s.organization_id::text
        end as key,
        coalesce(sum(s.taps), 0)::bigint as taps,
        coalesce(sum(s.unique_visitors), 0)::bigint as unique_visitors,
        coalesce(sum(s.nfc_taps), 0)::bigint as nfc_taps,
        coalesce(sum(s.qr_taps), 0)::bigint as qr_taps
      from public.daily_card_stats s
      where s.date between p_from and p_to
        and (p_organization_id is null or s.organization_id = p_organization_id)
        and (p_card_ids is null or s.card_id = any (p_card_ids))
        and (p_location_id is null or s.location_id = p_location_id)
        and (p_employee_id is null or s.employee_id = p_employee_id)
      group by 1
    ) g
    -- Итог без группировки возвращается всегда (нули, если строк нет);
    -- в группировке строки с пустым измерением (без филиала, сотрудника) не нужны.
    where p_dimension is null or g.key is not null
    order by g.key;
end;
$$;

-- CardRepository.assign. Блокирует карточки и заново проверяет «всё ещё свободны».
-- Два одновременных назначения одной карточки выстраиваются в очередь: второе
-- получит NOT_UNASSIGNED. Ответ: OK | NOT_FOUND | NOT_UNASSIGNED.
create function public.assign_cards(
  p_card_ids uuid[],
  p_organization_id uuid,
  p_location_id uuid,
  p_target_id uuid,
  p_activated_at timestamptz
)
returns text
language plpgsql security invoker set search_path = '' as $$
declare
  v_wanted integer := (select count(distinct id) from unnest(p_card_ids) as id);
  v_found integer;
  v_free integer;
begin
  perform 1 from public.cards where id = any (p_card_ids) order by id for update;

  select count(*), count(*) filter (where status = 'UNASSIGNED')
    into v_found, v_free
    from public.cards where id = any (p_card_ids);
  if v_found <> v_wanted then return 'NOT_FOUND'; end if;
  if v_free <> v_found then return 'NOT_UNASSIGNED'; end if;

  update public.cards
     set organization_id = p_organization_id,
         location_id = p_location_id,
         employee_id = null,
         target_id = p_target_id,
         status = 'ACTIVE',
         activated_at = p_activated_at
   where id = any (p_card_ids);
  return 'OK';
end;
$$;

-- CardBatchRepository.createWithCards. Партия и карточки с номерами 1…n —
-- одной транзакцией: при совпадении кода (unique) откатывается всё, сервис
-- генерирует новые коды и повторяет.
create function public.create_batch_with_cards(
  p_name text,
  p_card_type public.card_type,
  p_notes text,
  p_codes text[],
  p_labels text[]
)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_batch_id uuid;
begin
  if cardinality(p_codes) <> cardinality(p_labels) then
    raise exception 'create_batch_with_cards: codes and labels differ in length' using errcode = '22023';
  end if;
  insert into public.card_batches (name, quantity, card_type, notes)
    values (p_name, cardinality(p_codes), p_card_type, p_notes)
    returning id into v_batch_id;
  insert into public.cards (code, batch_id, number, label, type)
    select c.code, v_batch_id, c.n, c.label, p_card_type
    from unnest(p_codes, p_labels) with ordinality as c(code, label, n);
  return v_batch_id;
end;
$$;

-- CardBatchRepository.delete. Удаляет партию вместе с карточками, но только пока ни одна
-- из них не выдавалась клиентам и у них нет истории касаний (иначе: IN_USE).
-- Карточки удалять через RLS нельзя (там «удаления нет: REVOKED»), поэтому функция
-- security definer и сама проверяет, что вызывает администратор. Ответ: OK | NOT_FOUND | IN_USE.
create function public.delete_batch(p_batch_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and not private.is_platform_admin() then
    raise exception 'delete_batch: only administrators' using errcode = '42501';
  end if;

  perform 1 from public.card_batches where id = p_batch_id for update;
  if not found then return 'NOT_FOUND'; end if;

  if exists (
    select 1 from public.cards c
    where c.batch_id = p_batch_id
      and (c.status <> 'UNASSIGNED'
           or exists (select 1 from public.tap_events e where e.card_id = c.id)
           or exists (select 1 from public.daily_card_stats s where s.card_id = c.id))
  ) then
    return 'IN_USE';
  end if;

  delete from public.cards where batch_id = p_batch_id;
  delete from public.card_batches where id = p_batch_id;
  return 'OK';
end;
$$;

-- OrganizationRepository.createClient (мастер «Новый клиент»): организация и
-- филиалы (с подтверждённой целью «отзывы 2ГИС», если есть ссылка) одной
-- транзакцией. p_locations: [{ "name", "address", "twogisFirmId",
-- "twogisProfileUrl", "reviewsTargetUrl" }, …] — уже проверено Zod на сервере.
create function public.create_client(
  p_organization jsonb,
  p_locations jsonb
)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_org_id uuid;
  v_location_id uuid;
  v_location jsonb;
begin
  insert into public.organizations (name, contact_name, contact_phone, contact_email, timezone)
    values (
      p_organization ->> 'name',
      p_organization ->> 'contactName',
      p_organization ->> 'contactPhone',
      p_organization ->> 'contactEmail',
      coalesce(p_organization ->> 'timezone', 'Asia/Almaty')
    )
    returning id into v_org_id;

  for v_location in select * from jsonb_array_elements(p_locations) loop
    insert into public.locations (organization_id, name, address, twogis_firm_id, twogis_profile_url)
      values (
        v_org_id,
        v_location ->> 'name',
        v_location ->> 'address',
        v_location ->> 'twogisFirmId',
        v_location ->> 'twogisProfileUrl'
      )
      returning id into v_location_id;
    if v_location ->> 'reviewsTargetUrl' is not null then
      insert into public.redirect_targets (organization_id, location_id, type, url, is_verified)
        values (v_org_id, v_location_id, 'TWOGIS_REVIEW', v_location ->> 'reviewsTargetUrl', true);
    end if;
  end loop;
  return v_org_id;
end;
$$;

revoke execute on function public.daily_stat_totals, public.assign_cards, public.create_batch_with_cards,
  public.delete_batch, public.create_client from public, anon;
grant execute on function public.daily_stat_totals, public.assign_cards, public.create_batch_with_cards,
  public.delete_batch, public.create_client to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Аналитика касаний и сводные запросы
--
-- Репозитории вызывают эти функции через rpc: группировки и суммы считает БД,
-- в приложение приходят только итоги (а не тысячи строк). Все функции
-- security invoker: под пользовательским клиентом действует RLS, под системным
-- (service_role) видны все строки.
-- -----------------------------------------------------------------------------

-- Порядок карточек «партия, номер» (created_at у карточек = created_at партии).
create index cards_order_idx on public.cards (created_at, batch_id, number);

-- Число касаний за период: valid (без ботов и дублей), bots, duplicates или all.
create function public.tap_count(
  p_from timestamptz,
  p_to timestamptz,
  p_kind text default 'valid',
  p_organization_id uuid default null,
  p_card_ids uuid[] default null,
  p_location_id uuid default null,
  p_employee_id uuid default null
)
returns bigint
language plpgsql stable security invoker set search_path = '' as $$
begin
  if p_kind not in ('valid', 'bots', 'duplicates', 'all') then
    raise exception 'tap_count: unknown kind %', p_kind using errcode = '22023';
  end if;
  return (
    select count(*)
    from public.tap_events e
    where e.occurred_at >= p_from and e.occurred_at < p_to
      and (p_kind = 'all'
           or (p_kind = 'valid' and not e.is_bot and not e.is_duplicate)
           or (p_kind = 'bots' and e.is_bot)
           or (p_kind = 'duplicates' and e.is_duplicate))
      and (p_organization_id is null or e.organization_id = p_organization_id)
      and (p_card_ids is null or e.card_id = any (p_card_ids))
      and (p_location_id is null or e.location_id = p_location_id)
      and (p_employee_id is null or e.employee_id = p_employee_id)
  );
end;
$$;

-- Тепловая карта: день недели (1 = понедельник) × час в часовом поясе p_tz.
create function public.tap_heatmap(
  p_from timestamptz,
  p_to timestamptz,
  p_tz text,
  p_organization_id uuid default null,
  p_card_ids uuid[] default null,
  p_location_id uuid default null,
  p_employee_id uuid default null
)
returns table (weekday integer, hour integer, taps bigint)
language sql stable security invoker set search_path = '' as $$
  select
    extract(isodow from (e.occurred_at at time zone p_tz))::integer,
    extract(hour from (e.occurred_at at time zone p_tz))::integer,
    count(*)
  from public.tap_events e
  where e.occurred_at >= p_from and e.occurred_at < p_to
    and not e.is_bot and not e.is_duplicate
    and (p_organization_id is null or e.organization_id = p_organization_id)
    and (p_card_ids is null or e.card_id = any (p_card_ids))
    and (p_location_id is null or e.location_id = p_location_id)
    and (p_employee_id is null or e.employee_id = p_employee_id)
  group by 1, 2
  order by 1, 2
$$;

-- Разбивка валидных касаний: dimension = source | os | deviceType.
create function public.tap_breakdown(
  p_from timestamptz,
  p_to timestamptz,
  p_organization_id uuid default null,
  p_card_ids uuid[] default null,
  p_location_id uuid default null,
  p_employee_id uuid default null
)
returns table (dimension text, key text, taps bigint)
language sql stable security invoker set search_path = '' as $$
  with valid as (
    select e.source, e.os, e.device_type
    from public.tap_events e
    where e.occurred_at >= p_from and e.occurred_at < p_to
      and not e.is_bot and not e.is_duplicate
      and (p_organization_id is null or e.organization_id = p_organization_id)
      and (p_card_ids is null or e.card_id = any (p_card_ids))
      and (p_location_id is null or e.location_id = p_location_id)
      and (p_employee_id is null or e.employee_id = p_employee_id)
  )
  select 'source', v.source::text, count(*) from valid v group by 2
  union all
  select 'os', v.os::text, count(*) from valid v group by 2
  union all
  select 'deviceType', v.device_type::text, count(*) from valid v group by 2
$$;

-- Последнее валидное касание по каждой карточке.
create function public.last_tap_by_card(
  p_organization_id uuid default null,
  p_card_ids uuid[] default null,
  p_location_id uuid default null,
  p_employee_id uuid default null
)
returns table (card_id uuid, last_tap_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select e.card_id, max(e.occurred_at)
  from public.tap_events e
  where not e.is_bot and not e.is_duplicate
    and (p_organization_id is null or e.organization_id = p_organization_id)
    and (p_card_ids is null or e.card_id = any (p_card_ids))
    and (p_location_id is null or e.location_id = p_location_id)
    and (p_employee_id is null or e.employee_id = p_employee_id)
  group by e.card_id
$$;

-- Прогресс партий: сколько карточек выдано клиентам, записано на NFC и заблокировано.
create function public.batch_progress()
returns table (batch_id uuid, assigned bigint, written bigint, locked bigint)
language sql stable security invoker set search_path = '' as $$
  select c.batch_id,
         count(*) filter (where c.status <> 'UNASSIGNED'),
         count(*) filter (where c.nfc_written),
         count(*) filter (where c.nfc_locked)
  from public.cards c
  group by c.batch_id
$$;

-- Число карточек по значению измерения (organizationId | targetId | batchId);
-- строки, где значение пустое, не возвращаются.
create function public.card_counts(
  p_dimension text,
  p_organization_id uuid default null,
  p_batch_id uuid default null,
  p_location_id uuid default null,
  p_employee_id uuid default null,
  p_target_id uuid default null,
  p_statuses public.card_status[] default null,
  p_number_from integer default null,
  p_number_to integer default null,
  p_search text default null
)
returns table (key text, n bigint)
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_like text := replace(replace(replace(coalesce(p_search, ''), chr(92), chr(92) || chr(92)), '%', chr(92) || '%'), '_', chr(92) || '_');
begin
  if p_dimension not in ('organizationId', 'targetId', 'batchId') then
    raise exception 'card_counts: unknown dimension %', p_dimension using errcode = '22023';
  end if;
  return query
    select g.key, g.n
    from (
      select
        case p_dimension
          when 'organizationId' then c.organization_id::text
          when 'targetId' then c.target_id::text
          else c.batch_id::text
        end as key,
        count(*) as n
      from public.cards c
      where (p_organization_id is null or c.organization_id = p_organization_id)
        and (p_batch_id is null or c.batch_id = p_batch_id)
        and (p_location_id is null or c.location_id = p_location_id)
        and (p_employee_id is null or c.employee_id = p_employee_id)
        and (p_target_id is null or c.target_id = p_target_id)
        and (p_statuses is null or c.status = any (p_statuses))
        and (p_number_from is null or c.number >= p_number_from)
        and (p_number_to is null or c.number <= p_number_to)
        and (p_search is null or p_search = ''
             or c.code like v_like || '%'
             or c.label ilike '%' || v_like || '%')
      group by 1
    ) g
    where g.key is not null
    order by g.key;
end;
$$;

-- «Простаивающие» карточки: активные, выданные раньше p_activated_before,
-- без валидных касаний с локальной даты p_no_taps_since.
create function public.idle_cards(
  p_activated_before timestamptz,
  p_no_taps_since date,
  p_limit integer
)
returns setof public.cards
language sql stable security invoker set search_path = '' as $$
  select c.*
  from public.cards c
  where c.status = 'ACTIVE'
    and c.organization_id is not null
    and c.activated_at is not null
    and c.activated_at < p_activated_before
    and not exists (
      select 1 from public.daily_card_stats s
      where s.card_id = c.id and s.date >= p_no_taps_since and s.taps > 0
    )
  order by c.created_at, c.batch_id, c.number
  limit p_limit
$$;

-- Последний снимок рейтинга по каждому филиалу.
create function public.latest_rating_snapshots(p_location_ids uuid[])
returns setof public.rating_snapshots
language sql stable security invoker set search_path = '' as $$
  select distinct on (s.location_id) s.*
  from public.rating_snapshots s
  where s.location_id = any (p_location_ids)
  order by s.location_id, s.captured_at desc
$$;

revoke execute on function public.tap_count, public.tap_heatmap, public.tap_breakdown,
  public.last_tap_by_card, public.batch_progress, public.card_counts,
  public.idle_cards, public.latest_rating_snapshots from public, anon;
grant execute on function public.tap_count, public.tap_heatmap, public.tap_breakdown,
  public.last_tap_by_card, public.batch_progress, public.card_counts,
  public.idle_cards, public.latest_rating_snapshots to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- Вход, сброс пароля и очередь ручной отправки
-- -----------------------------------------------------------------------------

-- Одноразовые ссылки сброса пароля (и установки пароля новому сотруднику).
-- Сам токен не хранится — только SHA-256, как у приглашений. Срок жизни задаёт
-- приложение (а не настройки Supabase Auth), потому что ссылку отправляет
-- администратор вручную. Политик нет: таблица доступна только серверу (service_role).
create table public.password_reset_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id    uuid not null references public.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index password_reset_tokens_user_id_idx on public.password_reset_tokens (user_id);
alter table public.password_reset_tokens enable row level security;

-- Очередь сообщений, которые администратор отправляет вручную (/admin/outbox).
-- В тексте лежит одноразовая ссылка, поэтому доступ только у администратора.
create table public.outbox_messages (
  id         uuid primary key default gen_random_uuid(),
  to_address text not null check (char_length(to_address) <= 254),
  subject    text not null check (char_length(subject) <= 300),
  body       text not null check (char_length(body) <= 5000),
  tag        text not null check (tag in ('invitation', 'password_reset')),
  queued_at  timestamptz not null default now(),
  sent_at    timestamptz
);
create index outbox_messages_queued_at_idx on public.outbox_messages (queued_at desc);
alter table public.outbox_messages enable row level security;
create policy outbox_messages_admin on public.outbox_messages for all to authenticated
  using ((select private.is_platform_admin()))
  with check ((select private.is_platform_admin()));

-- Сессии принадлежат Supabase Auth (схема auth недоступна через API), поэтому
-- управление ими — через функции security definer с пустым search_path.

-- Завершить сессии пользователя (все или все, кроме одной). Только сервер.
create function public.revoke_user_sessions(p_user_id uuid, p_except_session_id uuid default null)
returns void
language sql security definer set search_path = '' as $$
  delete from auth.sessions s
  where s.user_id = p_user_id
    and (p_except_session_id is null or s.id <> p_except_session_id)
$$;
revoke execute on function public.revoke_user_sessions from public, anon, authenticated;
grant execute on function public.revoke_user_sessions to service_role;

-- Мои активные сессии (список в настройках аккаунта).
create function public.my_sessions()
returns table (id uuid, created_at timestamptz, last_seen_at timestamptz, expires_at timestamptz, user_agent text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.created_at, coalesce(s.refreshed_at, s.updated_at, s.created_at), s.not_after, s.user_agent
  from auth.sessions s
  where s.user_id = (select auth.uid())
  order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc
$$;

-- Завершить одну свою сессию.
create function public.revoke_my_session(p_session_id uuid)
returns void
language sql security definer set search_path = '' as $$
  delete from auth.sessions s
  where s.id = p_session_id and s.user_id = (select auth.uid())
$$;
revoke execute on function public.my_sessions, public.revoke_my_session from public, anon;
grant execute on function public.my_sessions, public.revoke_my_session to authenticated, service_role;
