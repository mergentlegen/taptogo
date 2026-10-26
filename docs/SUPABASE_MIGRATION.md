# Переход с моков на Supabase и 2ГИС

Пошаговый план для разработчика, который будет подключать реальные сервисы. Сейчас всё работает на данных в памяти процесса (`DATA_SOURCE=mock`). Устройство слоёв описано в [ARCHITECTURE.md](ARCHITECTURE.md).

## Главный принцип

Страницы, Server Actions и сервисы **не меняются**. Они получают интерфейсы из `src/server/container.ts`, и почти вся работа сводится к новым реализациям этих интерфейсов:

| Интерфейс                                                    | Сейчас                                       | После                                                                             |
| ------------------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------- |
| `Repositories` (`src/server/repositories/index.ts`), 20 штук | `repositories/mock/*`                        | `repositories/supabase/*`                                                         |
| `AuthService` (`src/server/auth/types.ts`)                   | `MockAuthService`                            | `SupabaseAuthService` (Supabase Auth)                                             |
| `EmailProvider` (`src/server/providers/email/types.ts`)      | `ManualOutbox` (очередь для ручной отправки) | очередь в таблице `outbox_messages` (Resend — только если понадобится автоматика) |
| `ReviewsProvider` (`src/server/providers/reviews/types.ts`)  | `MockReviewsProvider`                        | `TwoGisReviewsProvider` (2ГИС API)                                                |
| `RateLimiter` (`src/server/security/rate-limiter.ts`)        | `InMemoryRateLimiter`                        | Redis/Upstash, когда серверов больше одного                                       |

Каждый шаг ниже можно сделать и проверить отдельно. Моки остаются в коде: на них работают unit-тесты и локальная разработка без интернета.

Где интерфейс всё же придётся немного поменять, это сказано явно (шаг 3, сессии).

## Статус

| Шаг                                   | Состояние                                                                                                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Схема в Supabase                   | Готово: миграции `01…07` применены к проекту (`07_slim_down` убрала лиды, подписки, платежи, БИН и юр. название и добавила удаление партий; её текст — `docs/supabase/migrations/07_slim_down.sql`), `docs/supabase/schema.sql` совпадает с боевой БД, типы в `src/server/supabase/database.types.ts`. Проверка ключей: `pnpm check:supabase`.                                             |
| 2. Репозитории                        | Готово: `src/server/repositories/supabase/*`, клиенты в `src/server/supabase/clients.ts`. Интеграционные тесты на реальном проекте: `supabase-repositories.test.ts`.                                                                |
| 3. Supabase Auth                      | Готово: `src/server/auth/supabase-auth-service.ts` (вход, сессии, приглашения, сброс и временные пароли, просмотр кабинета клиента), `src/proxy.ts` обновляет cookie сессии. Тесты: `supabase-auth-service.test.ts`.                |
| 5. `DATA_SOURCE=supabase`, 6. очередь | Готово: ветка в `container.ts`, очередь писем в таблице `outbox_messages` (`supabase-outbox.ts`). Первый администратор: `pnpm create-admin you@example.com "Имя"`. Сквозная проверка на реальном проекте: `pnpm test:e2e:supabase`. |
| 7. 2ГИС, 8. Redis                     | Отложено (нет бюджета): 2ГИС скрыт флагом `features.twogisApi`; лимиты частоты считаются в памяти каждого экземпляра сервера.                                                                                                       |

Включить Supabase локально: в `.env.local` поставить `DATA_SOURCE=supabase` (ключи уже там) и создать администратора. Демо-аккаунты и «Войти как…» в этом режиме не существуют.

**Тесты на реальном проекте оставляют следы.** Журнал аудита нельзя менять и удалять (так задумано), а приложение пишет в него при каждом действии. Поэтому клиент или пользователь, с которыми что-то делали через интерфейс, физически не удаляются из БД: их можно только заблокировать/архивировать. Сквозные тесты (`pnpm test:e2e:supabase`) и тест страниц журнала (`SUPABASE_TEST_AUDIT=1`) годятся только для проекта разработки, пока в нём нет настоящих данных; на рабочей БД их запускать нельзя.

Сводные запросы (аналитика касаний, `card_counts`, `idle_cards`, `batch_progress`, `latest_rating_snapshots`, `delete_batch`) лежат в конце `schema.sql` и вызываются через `rpc`. После изменения схемы типы надо перегенерировать (MCP `generate_typescript_types` или `supabase gen types`).

## Шаг 0. Подготовка (до создания проекта)

1. **Контрактные тесты репозиториев.** Сейчас поведение репозиториев проверяет `src/server/repositories/mock/mock-repositories.test.ts`. Его нужно превратить в общий набор тестов, параметризованный фабрикой `() => Repositories`. Тогда одни и те же тесты прогонятся и на моках, и на Supabase (шаг 2).
   - Файлы: `src/server/repositories/contract.ts` (новый, сами тесты), `mock-repositories.test.ts` (вызывает контракт с моками).
2. **Переменные окружения.** Добавить в `envSchema` новые переменные. В `superRefine` сделать их обязательными, когда `DATA_SOURCE=supabase`.
   - Файлы: `src/env.core.ts`, `.env.example`.

   | Переменная                                   | Где используется             | Секрет |
   | -------------------------------------------- | ---------------------------- | ------ |
   | `DATA_SOURCE=supabase`                       | `container.ts`               | нет    |
   | `SUPABASE_URL`                               | клиенты Supabase             | нет    |
   | `SUPABASE_PUBLISHABLE_KEY` (бывший anon key) | клиент от имени пользователя | нет    |
   | `SUPABASE_SECRET_KEY` (бывший service_role)  | системный клиент             | **да** |
   | `TWOGIS_API_KEY`                             | `TwoGisReviewsProvider`      | **да** |
   | `CRON_SECRET`                                | защита cron-маршрутов        | **да** |

   Префикс `NEXT_PUBLIC_` не нужен ни одной переменной. Браузер не обращается к Supabase напрямую: все запросы идут через сервер (Server Components, Server Actions, route handlers). Это стоит сохранить, тогда секреты и даже publishable key не попадают в клиентский бандл, а CSP `connect-src 'self'` не меняется.

## Шаг 1. Проект Supabase и схема

1. Создать проект в регионе ближе к Казахстану (например, Frankfurt).
2. Установить Supabase CLI и выполнить `supabase init` в корне. Появятся `supabase/config.toml` и `supabase/migrations/`.
3. Разбить [supabase/schema.sql](supabase/schema.sql) на миграции и выполнить их сначала локально (`supabase start`, `supabase db reset`), затем на staging:
   - `0001_types_and_tables.sql` — перечисления, таблицы, индексы, `platform_settings`;
   - `0002_rls.sql` — схема `private`, функции-помощники, `enable row level security`, политики;
   - `0003_guards.sql` — триггеры-охранники и `increment_daily_card_stat`;
   - `0004_analytics_rpc.sql` — RPC для тепловой карты и разбивок (см. шаг 2).
4. Сгенерировать типы: `supabase gen types typescript --local > src/server/supabase/database.types.ts`.
5. **Тесты RLS.** Уже сейчас `tests/schema/rls.test.ts` выполняет `schema.sql` в PGlite (настоящий Postgres в WASM) поверх заглушек Supabase и проверяет политики от лица каждой роли — это часть `pnpm test`. На реальном проекте те же сценарии стоит повторить на pgTAP (`supabase test db`, файлы в `supabase/tests/`), потому что заглушки `auth` и `storage` упрощены. Минимальный набор повторяет раздел 10 ТЗ:
   - OWNER организации A не видит и не меняет карточки, сотрудников, касания и статистику организации B;
   - MANAGER не может изменить команду и данные организации; клиент не может создать партию или внести платёж;
   - клиент не может поменять у карточки `organization_id`, `code` или поставить `REVOKED`;
   - в `audit_logs` нельзя выполнить `UPDATE`/`DELETE` ни одной ролью;
   - нельзя удалить последнего OWNER.
6. **Демо-данные для staging** (не для production!). Скрипт `scripts/seed-supabase.ts`:
   - берёт `createSeedData()` из `src/mocks/seed.ts`;
   - создаёт пользователей через `auth.admin.createUser` с паролем `demo12345`;
   - вставляет строки системным клиентом, переводя camelCase в snake_case.

Файлы: `supabase/**` (новые), `src/server/supabase/database.types.ts` (сгенерированный), `scripts/seed-supabase.ts` (новый).

## Шаг 2. Репозитории Supabase

### Клиенты

Новый файл `src/server/supabase/clients.ts` (с `import "server-only"`):

- `getUserClient()` — `createServerClient` из `@supabase/ssr` с publishable key и cookies из `next/headers`, один на запрос (`cache()` из React). Запросы идут от имени пользователя, **RLS действует**.
- `getSystemClient()` — `createClient` с secret key, `auth.persistSession = false`, один на процесс. **RLS не действует.**

### Два набора репозиториев

В контейнере уже есть два поля (в моке это один и тот же объект):

- `repositories` — от имени вошедшего пользователя. Им пользуются кабинет и админ-панель. Здесь работает `getUserClient()`.
- `systemRepositories` — для операций без пользователя: редирект `/t/{code}` и запись касаний, заявки с лендинга, `AuthService` (вход, приглашения, сброс пароля), будущие cron-задачи. Здесь работает `getSystemClient()`.

Аналогично есть `audit` и `systemAudit`: системные записи с `actor_user_id = null` возможны только через системный клиент, это требование RLS.

`createSupabaseRepositories(db: () => Promise<SupabaseClient<Database>>)` создаёт все 20 репозиториев поверх переданного клиента. Контейнер вызывает её дважды, с разными клиентами.

### Правила реализации

- **Один файл на файл мока:** `repositories/supabase/{analytics,cards,inbox,organizations,system,users}.ts` плюс `index.ts`.
- **Маппинг строк:** функции `fromRow`/`toRow` для перевода snake_case ↔ camelCase. При чтении строку прогонять через Zod-схему сущности (`cardSchema.parse(...)`). Расхождение схемы БД и кода тогда сразу видно в ошибке, а не тихо в UI.
- **`OrgScope` не выбрасывать:** если он передан, добавлять `.eq("organization_id", scope.organizationId)` даже при включённом RLS. Это защита в глубину: RLS ограничивает пользователя всеми его организациями, а scope — активной.
- **Ошибки:** «строка не найдена» при `update` → `AppError("NOT_FOUND")`, как в моке (см. соглашения в `repositories/common.ts`). Код `42501` из триггеров-охранников → `AppError("FORBIDDEN")`, `23505` (unique) → `AppError("CONFLICT")`.
- **Полнота ответа.** API Supabase по умолчанию отдаёт не больше 1000 строк. Методы, которые по контракту возвращают «всё» (`cards.list` одной организации или партии, `locations.list`, `ratingSnapshots.list`…), обязаны дочитывать страницами через `.range(from, to)`, иначе данные тихо обрежутся. Методы с `limit` (`search`, `tickets.list`) — один запрос.
- **Пачки id и кодов** (`findByIds`, `findByCodes`, `listByIds`, `comments.listFor`) — `.in("…", ids)`, разбивая список на куски по ~200, чтобы не упереться в длину URL.
- **Суммы и атомарные операции уже написаны в `schema.sql`** и проверяются тестом `tests/schema/rls.test.ts`. Репозиторий только вызывает их через `rpc`:

  | Метод                                           | Реализация                                                                                                      |
  | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
  | `dailyStats.total`, `totalsBy`                  | `rpc("daily_stat_totals", { p_from, p_to, p_dimension, … })` — `sum … group by` в БД                            |
  | `dailyStats.increment`                          | `rpc("increment_daily_card_stat", …)`: атомарный `+N`, только системный клиент                                  |
  | `cards.assign`                                  | `rpc("assign_cards", …)`: блокирует карточки и повторно проверяет, что они свободны                           |
  | `batches.createWithCards`                       | `rpc("create_batch_with_cards", …)`: партия и карточки с номерами одной транзакцией; `23505` → `CONFLICT`       |
  | `organizations.createClient`                    | `rpc("create_client", …)`: организация, филиалы и цели одной транзакцией                                       |
  | `tapEvents.insert`                              | `upsert(…, { onConflict: "id,occurred_at", ignoreDuplicates: true }).select()`; пустой ответ → `created: false` |
  | `tapEvents.heatmap`                             | RPC `tap_heatmap(org, from, to, tz)`: `group by extract(isodow/hour from occurred_at at time zone tz)`          |
  | `tapEvents.breakdown`, `lastTapByCard`, `count` | RPC с `group by` / `distinct on (card_id)` / `count(*)`                                                         |
  | `cards.search`                                  | `select("*", { count: "exact" }).order("batch_id").order("number").limit(n)` — страница и общее число           |
  | `cards.count`, `countBy`, `batches.progress`    | `count: "exact", head: true` или RPC с `group by`                                                               |
  | `cards.listIdle`                                | `status = 'ACTIVE' and not exists (select 1 from daily_card_stats where … date >= since and taps > 0) limit n`  |
  | `auditLogs.appendMany`                          | один `insert([...])`                                                                                            |
  | `auditLogs.list` (курсор)                       | keyset по `(created_at, id)`, курсор — base64 от этой пары                                                      |
  | `organizations.list({ search })`                | `name.ilike.%q%`; спецсимволы `%` и `_` в `q` экранировать                                         |

- **Вид на организацию** (`repositories/tenant.ts`, `forOrganization`) работает поверх любых `Repositories` — для Supabase его переписывать не нужно.

Готовность шага: контрактные тесты из шага 0 проходят на локальном Supabase (`supabase start`).

Файлы: `src/server/supabase/clients.ts`, `src/server/repositories/supabase/*` (новые). Тесты: `src/server/repositories/supabase/supabase-repositories.test.ts`, запускаются только при `SUPABASE_URL` в окружении.

## Шаг 3. Supabase Auth вместо MockAuthService

Новый `src/server/auth/supabase-auth-service.ts` реализует `AuthService` с помощью `@supabase/ssr`. Пароли, хеши, refresh-токены и подтверждение email берёт на себя Supabase. Профиль, роли и статусы остаются в `public.users`.

| Метод `AuthService`                       | Как реализовать                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signIn`                                  | Сначала наш `RateLimiter` (5 попыток за 15 минут, как сейчас), затем `signInWithPassword`. Если `users.status = BLOCKED` → `signOut` и `BLOCKED`. `last_login_at` и запись в журнал — через `systemRepositories`. Для неверного email и неверного пароля — одинаковый ответ `INVALID_CREDENTIALS`. |
| `signOut`                                 | `auth.signOut()` (текущая сессия)                                                                                                                                                                                                                                                                  |
| `getSession`                              | `auth.getClaims()` (проверка JWT) + профиль из `public.users`. Время жизни 12 ч для сотрудников и 7 дней для клиентов проверяется по времени входа (`amr[0].timestamp` в JWT); просроченную сессию закрыть.                                                                                        |
| `listSessions`, `revokeSession`           | RPC с `security definer` над `auth.sessions` (только `user_id = auth.uid()`). Перед внедрением сверить с текущей документацией Supabase: схема `auth` принадлежит Supabase.                                                                                                                        |
| `requestPasswordReset`                    | `auth.admin.generateLink({ type: "recovery" })` системным клиентом. Ссылку собираем сами и отправляем **нашим** шаблоном через `EmailProvider`, а не письмом Supabase. Лимиты по email и IP остаются.                                                                                              |
| `resetPassword`                           | `verifyOtp({ type: "recovery", token_hash })` → `updateUser({ password })` → `signOut({ scope: "global" })`                                                                                                                                                                                        |
| `issueTemporaryPassword`                  | `auth.admin.updateUserById(id, { password })` с временным паролем, `users.must_change_password = true`, затем `auth.admin.signOut(id, "global")`. Пароль возвращается один раз админу и нигде не логируется.                                                                                       |
| `changePassword`                          | Проверить текущий пароль через `signInWithPassword` на отдельном клиенте без cookie → `auth.admin.updateUserById` → `signOut({ scope: "others" })`                                                                                                                                                 |
| `getInvitation`, `acceptInvitation`       | Своя таблица `invitations` остаётся: токен в письме, в БД только SHA-256. Новый пользователь — `auth.admin.createUser({ email, password, email_confirm: true })` + строка в `users` + `memberships` (системный клиент).                                                                            |
| `startImpersonation`, `stopImpersonation` | Таблица `impersonation_sessions`, ключ — `session_id` из JWT                                                                                                                                                                                                                                       |

**Что меняется помимо новой реализации** (единственное место, где трогаем существующие файлы):

- `AuthService.getSession(token)`: токен из cookie больше не передаётся, Supabase сам читает свои cookie. Сигнатура станет `getSession()`.
- `src/server/auth/session.ts`: `getCurrentSession` перестаёт читать `ttg_session`. `setSessionCookie`/`clearSessionCookie` превращаются в пустые операции: cookie пишет `@supabase/ssr`.
- `src/proxy.ts`: оптимистичная проверка `ttg_session` заменяется обновлением сессии Supabase по их рецепту для middleware/proxy (`createServerClient` + `getClaims()`) и редиректом на `/login` без сессии. Генерацию nonce и CSP не трогать.
- `src/server/auth/session-token.ts`, `SESSION_SECRET`: больше не нужны (оставить, пока мок жив).
- **Создание сотрудника** (`AdminStaffService.create`): строка в `users` создаётся после `auth.admin.createUser({ email, email_confirm: true })` без пароля, затем отправляется ссылка на установку пароля (как сейчас).
- **«Войти как…»:** в контейнере Supabase `demo = null`. Очередь `/admin/outbox` остаётся, она будет храниться в таблице. Блок не рендерится, страницы отвечают 404 (это уже так в production-сборке).
- **2FA** (`users.totp_enabled`) позже можно сделать на Supabase MFA (TOTP) — для сотрудников платформы в первую очередь.

Готовность шага: e2e `tests/e2e/auth.spec.ts` проходит на staging (кроме тестов, которые зависят от демо-данных мока).

Файлы:

- новые: `src/server/auth/supabase-auth-service.ts`, RPC-миграция `0006_sessions_rpc.sql`;
- меняются: `src/server/auth/types.ts`, `src/server/auth/session.ts`, `src/proxy.ts`.

## Шаг 4. Логотипов и файлов нет

Загрузка логотипа убрана (бесплатный план Supabase, без Storage). Bucket, `StorageProvider` и CSP-правила для хранилища в проект не входят. Если позже понадобится файловое хранилище, его добавляют отдельным шагом.

## Шаг 5. Переключить `DATA_SOURCE=supabase`

В `src/server/container.ts` добавить ветку `case "supabase": return createSupabaseContainer();`:

```ts
function createSupabaseContainer(): Container {
  const repositories = createSupabaseRepositories(getUserClient);
  const systemRepositories = createSupabaseRepositories(async () => getSystemClient());
  // ...auth, outbox, reviews, rateLimiter — новые реализации
  return { repositories, systemRepositories, /* ... */ outbox: <ManualOutbox в таблице>, demo: null, clock: () => new Date() };
}
```

Порядок выката:

1. staging с демо-данными;
2. прогон `pnpm test:e2e` против staging;
3. production с пустой БД. Первый ADMIN создаётся вручную: `auth.admin.createUser` + `update users set platform_role = 'ADMIN'` системным ключом.

Файлы: `src/server/container.ts`.

## Шаг 6. Очередь писем в таблице (Resend не используется)

Письма не отправляются автоматически: сброс пароля, приглашения и ссылки ставятся в очередь, а администратор отправляет их вручную со страницы `/admin/outbox`.

- Таблица `outbox_messages` (id, to, subject, text, tag, queued_at, sent_at). Колонка `text` содержит одноразовую ссылку, доступ к таблице только у ADMIN и выше (RLS).
- `ManualOutbox` из `src/server/providers/email/manual.ts` переписывается на эту таблицу, интерфейс `EmailProvider` не меняется.
- Журнал записывает отметку «отправлено», но не текст письма и не адрес получателя.
- Если позже понадобится автоматическая отправка, добавляется отдельный провайдер (например, `ResendEmailProvider`), а очередь остаётся для ручных сообщений.

## Шаг 7. 2ГИС вместо MockReviewsProvider и ежедневная синхронизация

`TwoGisReviewsProvider implements ReviewsProvider` в `src/server/providers/reviews/twogis.ts`.

- `resolveFirm(url)` — достаёт id организации из ссылки (`/firm/{id}`; короткие `go.2gis.com/...` раскрыть запросом с `redirect: "manual"`) и запрашивает карточку организации.
- `fetchStats(firmId)` — текущий рейтинг и число отзывов. Тексты отзывов не берём и не храним: это вне контракта и вне ТЗ.
- Конкретный метод API, поля ответа, лимиты и условия использования сверить с актуальной документацией 2ГИС и договором на ключ.
- Ключ `TWOGIS_API_KEY` только на сервере. Не логировать URL запроса целиком, если ключ стоит в query-параметре.
- `isConnected = true` — бейдж «Подключено» в `/admin/integrations` появится сам.

**Cron.** Маршрут `src/app/api/cron/sync-ratings/route.ts`:

- `GET`, требует заголовок `Authorization: Bearer ${CRON_SECRET}`, иначе 401;
- для каждого активного филиала с `twogis_firm_id` вызывает `fetchStats` и пишет `rating_snapshots` через `systemRepositories`, с паузой между запросами под лимит API;
- запускается раз в сутки в 03:00 Asia/Almaty (22:00 UTC) — так обещано в интерфейсе админки;
- планировщик: Vercel Cron, Supabase `pg_cron` + `pg_net` или любой внешний. Выбирается вместе с хостингом.

Ручная синхронизация из админки (`AdminIntegrationService.sync`, не чаще раза в час на филиал) уже работает через тот же интерфейс.

Тем же способом позже добавляются ежедневные задачи, для которых уже есть данные и настройки:

- еженедельный отчёт и предупреждение о падении активности: отдельного согласия (таблицы настроек) пока нет, его стоит завести вместе с рассылкой.

Файлы:

- новые: `src/server/providers/reviews/twogis.ts`, `src/app/api/cron/sync-ratings/route.ts`;
- меняется: `src/server/container.ts`.

## Шаг 8. Лимиты частоты для нескольких серверов

`InMemoryRateLimiter` считает попытки в памяти одного процесса. Когда серверов станет больше одного (или на serverless-хостинге), заменить его на реализацию `RateLimiter` поверх Redis (например, Upstash) со скользящим окном.

Где действуют лимиты (правила остаются прежними):

- вход;
- сброс пароля;
- смена пароля;
- редирект `/t/{code}` — 60 в минуту с IP;
- заявки с лендинга.

(Ручная синхронизация 2ГИС ограничена иначе — по времени последнего снапшота в БД, ей Redis не нужен.)

Файлы:

- новый: `src/server/security/redis-rate-limiter.ts`;
- меняются: `src/server/container.ts`, `src/env.core.ts`.

## Чек-лист перед production

- [ ] RLS-тесты (шаг 1.5) зелёные; в Supabase Advisor нет предупреждений о таблицах без RLS.
- [ ] Secret key Supabase есть только в окружении сервера; `grep` по `.next/static` его не находит.
- [ ] Reverse proxy перезаписывает `X-Real-IP`: от этого зависят лимиты (см. README).
- [ ] Резервные копии БД (Point-in-Time Recovery) включены.
- [ ] Уведомление о cookie (`ttg_seen` на телефоне гостя) и текст согласия на обработку персональных данных в форме заявки.
- [ ] Реальные контакты в `src/config/contacts.ts`.
- [ ] Настоящий `APP_URL`: от него строятся ссылки на NFC-метках. **После печати карточек домен менять нельзя.**
