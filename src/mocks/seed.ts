import { createHash } from "node:crypto";

import type { DailyCardStat, DeviceType, OperatingSystem, TapEvent } from "@/features/analytics/schemas";
import type { AuditLog } from "@/features/audit/schemas";
import type { CardBatch } from "@/features/batches/schemas";
import { generateCardCode } from "@/features/cards/code";
import type { Card, CardStatus, CardType } from "@/features/cards/schemas";
import type { Employee } from "@/features/employees/schemas";
import type { Lead } from "@/features/leads/schemas";
import type { Location, RatingSnapshot } from "@/features/locations/schemas";
import type { NotificationSetting } from "@/features/notifications/schemas";
import type { Organization } from "@/features/organizations/schemas";
import { defaultPlatformSettings } from "@/features/platform/schemas";
import type { Payment, Subscription } from "@/features/subscriptions/schemas";
import type { InternalComment, SupportTicket } from "@/features/support/schemas";
import type { RedirectTarget } from "@/features/targets/schemas";
import type { Membership, OrgRole } from "@/features/team/schemas";
import type { PlatformRole, User } from "@/features/users/schemas";
import {
  addDays,
  DEFAULT_TIME_ZONE,
  isoWeekday,
  localHourAndWeekday,
  toLocalDate,
  zonedTimeToUtc,
} from "@/lib/dates";

import type { MockDatabase, StoredInvitation } from "./db";
import { SeededRandom } from "./random";

/** Same seed → same data. Dates are relative to `now`, so charts always end today. */
export const DEMO_SEED = 20261017;
export const HISTORY_DAYS = 90;

/** Development only: every demo account uses this password. */
export const DEMO_PASSWORD = "demo12345";

/** Raw token of the pending demo invitation (only its hash is stored). */
export const DEMO_INVITATION_TOKEN = "demo-invitation-token-coffee-point";

export const demoAccounts = [
  { email: "superadmin@taptogo.kz", role: "SUPER_ADMIN" },
  { email: "admin@taptogo.kz", role: "ADMIN" },
  { email: "support@taptogo.kz", role: "SUPPORT" },
  { email: "owner@coffeepoint.kz", role: "OWNER" },
  { email: "manager@coffeepoint.kz", role: "MANAGER" },
  { email: "viewer@coffeepoint.kz", role: "VIEWER" },
] as const satisfies readonly { email: string; role: PlatformRole | OrgRole }[];

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

type OrgKey = "coffee" | "beauty" | "carwash";

type LocationSpec = {
  key: string;
  org: OrgKey;
  name: string;
  address: string;
  city: string;
  firmId: string | null;
  /** Day (relative to today) when the first cards were installed. */
  installOffset: number;
};

type CardSpec = {
  batch: 1 | 2;
  location: string | null;
  label: string;
  type: CardType;
  employee?: string;
  status: CardStatus;
  /** For PAUSED/LOST/REVOKED: day the status changed; taps stop there. */
  changedOffset?: number;
  /** Mean valid taps per day at full adoption. */
  rate?: number;
};

const LOCATIONS: LocationSpec[] = [
  {
    key: "coffee-abay",
    org: "coffee",
    name: "Coffee Point на Абая",
    address: "Алматы, пр. Абая, 150",
    city: "almaty",
    firmId: "70000001034567801",
    installOffset: -60,
  },
  {
    key: "coffee-dostyk",
    org: "coffee",
    name: "Coffee Point на Достык",
    address: "Алматы, пр. Достык, 89",
    city: "almaty",
    firmId: "70000001034567802",
    installOffset: -45,
  },
  {
    key: "beauty-main",
    org: "beauty",
    name: "Aru Beauty",
    address: "Астана, пр. Мангилик Ел, 55",
    city: "astana",
    firmId: "70000001045678901",
    installOffset: -50,
  },
  {
    key: "wash-farabi",
    org: "carwash",
    name: "AquaDrive аль-Фараби",
    address: "Алматы, пр. аль-Фараби, 77/8",
    city: "almaty",
    firmId: "70000001056789011",
    installOffset: -75,
  },
  {
    key: "wash-ryskulov",
    org: "carwash",
    name: "AquaDrive Рыскулова",
    address: "Алматы, пр. Рыскулова, 103",
    city: "almaty",
    firmId: "70000001056789012",
    installOffset: -40,
  },
  {
    key: "wash-shymkent",
    org: "carwash",
    name: "AquaDrive Шымкент",
    address: "Шымкент, ул. Байтурсынова, 12",
    city: "shymkent",
    // Just opened: not linked to 2GIS yet, so it has no rating history.
    firmId: null,
    installOffset: -12,
  },
];

const EMPLOYEES: { key: string; location: string; name: string; position: string; isActive?: boolean }[] = [
  { key: "aigerim", location: "coffee-abay", name: "Айгерим Султанова", position: "Бариста" },
  { key: "daniyar", location: "coffee-abay", name: "Данияр Оспанов", position: "Бариста" },
  { key: "madina", location: "coffee-dostyk", name: "Мадина Ержанова", position: "Бариста" },
  { key: "arman", location: "coffee-dostyk", name: "Арман Ким", position: "Администратор", isActive: false },
  { key: "kamila", location: "beauty-main", name: "Камила Ибраева", position: "Мастер маникюра" },
  { key: "zhanna", location: "beauty-main", name: "Жанна Муратова", position: "Парикмахер" },
  { key: "sabina", location: "beauty-main", name: "Сабина Алиева", position: "Бровист" },
  { key: "erlan", location: "wash-farabi", name: "Ерлан Тулегенов", position: "Мойщик" },
  { key: "baurzhan", location: "wash-ryskulov", name: "Бауыржан Сагындык", position: "Администратор" },
  { key: "timur", location: "wash-shymkent", name: "Тимур Абдрахманов", position: "Мойщик" },
];

const CARDS: CardSpec[] = [
  // Batch 1 — NFC cards and stands, fully assigned.
  { batch: 1, location: "coffee-abay", label: "Касса", type: "STAND", status: "ACTIVE", rate: 7 },
  { batch: 1, location: "coffee-abay", label: "Стол 1", type: "NFC_CARD", status: "ACTIVE", rate: 2.5 },
  { batch: 1, location: "coffee-abay", label: "Стол 2", type: "NFC_CARD", status: "ACTIVE", rate: 2 },
  { batch: 1, location: "coffee-abay", label: "Стол 3", type: "NFC_CARD", status: "ACTIVE", rate: 1.2 },
  {
    batch: 1,
    location: "coffee-abay",
    label: "Бариста Айгерим",
    type: "NFC_CARD",
    employee: "aigerim",
    status: "ACTIVE",
    rate: 5,
  },
  {
    batch: 1,
    location: "coffee-abay",
    label: "Бариста Данияр",
    type: "NFC_CARD",
    employee: "daniyar",
    status: "ACTIVE",
    rate: 3,
  },
  { batch: 1, location: "coffee-dostyk", label: "Касса", type: "STAND", status: "ACTIVE", rate: 6 },
  { batch: 1, location: "coffee-dostyk", label: "Стол 1", type: "NFC_CARD", status: "ACTIVE", rate: 1.8 },
  { batch: 1, location: "coffee-dostyk", label: "Стол 2", type: "NFC_CARD", status: "ACTIVE", rate: 1.5 },
  {
    batch: 1,
    location: "coffee-dostyk",
    label: "Бариста Мадина",
    type: "NFC_CARD",
    employee: "madina",
    status: "ACTIVE",
    rate: 4,
  },
  {
    batch: 1,
    location: "coffee-dostyk",
    label: "Администратор Арман",
    type: "NFC_CARD",
    employee: "arman",
    status: "PAUSED",
    changedOffset: -14,
    rate: 2,
  },
  { batch: 1, location: "beauty-main", label: "Ресепшн", type: "STAND", status: "ACTIVE", rate: 3 },
  {
    batch: 1,
    location: "beauty-main",
    label: "Мастер Камила",
    type: "NFC_CARD",
    employee: "kamila",
    status: "ACTIVE",
    rate: 2.5,
  },
  {
    batch: 1,
    location: "beauty-main",
    label: "Мастер Жанна",
    type: "NFC_CARD",
    employee: "zhanna",
    status: "ACTIVE",
    rate: 1.8,
  },
  {
    batch: 1,
    location: "beauty-main",
    label: "Мастер Сабина",
    type: "NFC_CARD",
    employee: "sabina",
    status: "ACTIVE",
    rate: 1.5,
  },
  {
    batch: 1,
    location: "beauty-main",
    label: "Зеркало 1",
    type: "NFC_CARD",
    status: "LOST",
    changedOffset: -10,
    rate: 1,
  },
  { batch: 1, location: "wash-farabi", label: "Касса", type: "STAND", status: "ACTIVE", rate: 5 },
  {
    batch: 1,
    location: "wash-farabi",
    label: "Мойщик Ерлан",
    type: "NFC_CARD",
    employee: "erlan",
    status: "ACTIVE",
    rate: 3,
  },
  { batch: 1, location: "wash-farabi", label: "Зона ожидания", type: "NFC_CARD", status: "ACTIVE", rate: 2 },
  { batch: 1, location: "wash-ryskulov", label: "Касса", type: "NFC_CARD", status: "ACTIVE", rate: 4 },
  {
    batch: 1,
    location: "wash-ryskulov",
    label: "Администратор Бауыржан",
    type: "NFC_CARD",
    employee: "baurzhan",
    status: "ACTIVE",
    rate: 2.5,
  },
  { batch: 1, location: "wash-ryskulov", label: "Выдача авто", type: "NFC_CARD", status: "ACTIVE", rate: 2 },
  { batch: 1, location: "wash-shymkent", label: "Касса", type: "NFC_CARD", status: "ACTIVE", rate: 3 },
  {
    batch: 1,
    location: "wash-shymkent",
    label: "Мойщик Тимур",
    type: "NFC_CARD",
    employee: "timur",
    status: "ACTIVE",
    rate: 2,
  },
  // Batch 2 — stickers and QR, partly unassigned.
  {
    batch: 2,
    location: "coffee-abay",
    label: "Стикер на витрине",
    type: "STICKER",
    status: "ACTIVE",
    rate: 1.5,
  },
  { batch: 2, location: "coffee-abay", label: "QR на столе", type: "QR_ONLY", status: "ACTIVE", rate: 1 },
  { batch: 2, location: "coffee-dostyk", label: "QR в меню", type: "QR_ONLY", status: "ACTIVE", rate: 1.2 },
  { batch: 2, location: "beauty-main", label: "QR на чеке", type: "QR_ONLY", status: "ACTIVE", rate: 0.8 },
  {
    batch: 2,
    location: "wash-farabi",
    label: "Стикер на стекле",
    type: "STICKER",
    status: "ACTIVE",
    rate: 1.5,
  },
  {
    batch: 2,
    location: "wash-ryskulov",
    label: "QR на въезде",
    type: "QR_ONLY",
    status: "ACTIVE",
    rate: 1.5,
  },
  {
    batch: 2,
    location: "wash-ryskulov",
    label: "Старый стикер",
    type: "STICKER",
    status: "REVOKED",
    changedOffset: -25,
    rate: 1,
  },
  ...Array.from({ length: 5 }, (_, i): CardSpec => ({
    batch: 2,
    location: null,
    label: `Стикер ${i + 1}`,
    type: "STICKER",
    status: "UNASSIGNED",
  })),
];

/** Batch 2 arrived later than batch 1. */
const BATCH_2_EARLIEST_OFFSET = -30;

/** Mon … Sun: weekends and Friday evenings are busier. */
const WEEKDAY_FACTOR = [0.85, 0.9, 0.95, 1, 1.15, 1.35, 1.3] as const;

/** Lunch (12–14) and evening (18–21) peaks; closed at night. */
const HOUR_WEIGHTS: (readonly [number, number])[] = [
  [8, 2],
  [9, 3],
  [10, 3],
  [11, 4],
  [12, 8],
  [13, 9],
  [14, 7],
  [15, 4],
  [16, 4],
  [17, 5],
  [18, 7],
  [19, 8],
  [20, 7],
  [21, 5],
  [22, 2],
];

const BOT_SHARE = 0.035;
const DUPLICATE_SHARE = 0.04;

export type SeedOptions = { seed?: number; now?: Date };

export function createSeedData({ seed = DEMO_SEED, now = new Date() }: SeedOptions = {}): MockDatabase {
  const rng = new SeededRandom(seed);
  const tz = DEFAULT_TIME_ZONE;
  const today = toLocalDate(now, tz);
  const currentHour = localHourAndWeekday(now, tz).hour;
  /** Instant of a local time `offset` days from today. */
  const at = (offset: number, hour = 10, minute = 0) =>
    zonedTimeToUtc(addDays(today, offset), { hour, minute }, tz).toISOString();
  const round2 = (value: number) => Math.round(value * 100) / 100;

  // ── People ──────────────────────────────────────────────────────────────
  const makeUser = (
    email: string,
    name: string,
    platformRole: PlatformRole | null,
    extra: Partial<User> = {},
  ): User => ({
    id: rng.uuid(),
    email,
    name,
    phone: null,
    platformRole,
    status: "ACTIVE",
    totpEnabled: false,
    lastLoginAt: at(-1, 9, 30),
    createdAt: at(-120),
    ...extra,
  });

  const superAdmin = makeUser("superadmin@taptogo.kz", "Ерболат Сериков", "SUPER_ADMIN", {
    totpEnabled: true,
  });
  const admin = makeUser("admin@taptogo.kz", "Динара Касымова", "ADMIN", { phone: "+77010000002" });
  const support = makeUser("support@taptogo.kz", "Нурсултан Абенов", "SUPPORT");
  const formerSupport = makeUser("old.support@taptogo.kz", "Асель Нуриева", "SUPPORT", {
    status: "BLOCKED",
    lastLoginAt: at(-70),
  });
  const coffeeOwner = makeUser("owner@coffeepoint.kz", "Аружан Сейткали", null, { phone: "+77011234567" });
  const coffeeManager = makeUser("manager@coffeepoint.kz", "Мадина Ахмет", null);
  const coffeeViewer = makeUser("viewer@coffeepoint.kz", "Тимур Жаксылыков", null, { lastLoginAt: at(-6) });
  const beautyOwner = makeUser("owner@arubeauty.kz", "Алия Ахметова", null, { phone: "+77027654321" });
  const washOwner = makeUser("owner@aquadrive.kz", "Ержан Беков", null, { phone: "+77755550011" });
  const users = [
    superAdmin,
    admin,
    support,
    formerSupport,
    coffeeOwner,
    coffeeManager,
    coffeeViewer,
    beautyOwner,
    washOwner,
  ];

  // ── Organizations ───────────────────────────────────────────────────────
  const makeOrg = (fields: Omit<Organization, "id" | "timezone" | "logoUrl" | "status" | "createdAt">) => ({
    id: rng.uuid(),
    timezone: tz,
    logoUrl: null,
    status: "ACTIVE" as const,
    createdAt: at(-HISTORY_DAYS - 10),
    ...fields,
  });
  const orgs: Record<OrgKey, Organization> = {
    coffee: makeOrg({
      name: "Coffee Point",
      legalName: "ТОО «Coffee Point»",
      bin: "180340012345",
      contactName: "Аружан Сейткали",
      contactPhone: "+77011234567",
      contactEmail: "hello@coffeepoint.kz",
    }),
    beauty: makeOrg({
      name: "Aru Beauty",
      legalName: "ИП Ахметова А.",
      bin: "900215400123",
      contactName: "Алия Ахметова",
      contactPhone: "+77027654321",
      contactEmail: "aru.beauty@mail.kz",
    }),
    carwash: makeOrg({
      name: "AquaDrive",
      legalName: "ТОО «AquaDrive Group»",
      bin: "150640098765",
      contactName: "Ержан Беков",
      contactPhone: "+77755550011",
      contactEmail: "office@aquadrive.kz",
    }),
  };

  const memberships: Membership[] = [
    { userId: coffeeOwner.id, organizationId: orgs.coffee.id, role: "OWNER", createdAt: at(-100) },
    { userId: coffeeManager.id, organizationId: orgs.coffee.id, role: "MANAGER", createdAt: at(-90) },
    { userId: coffeeViewer.id, organizationId: orgs.coffee.id, role: "VIEWER", createdAt: at(-60) },
    { userId: beautyOwner.id, organizationId: orgs.beauty.id, role: "OWNER", createdAt: at(-100) },
    { userId: washOwner.id, organizationId: orgs.carwash.id, role: "OWNER", createdAt: at(-100) },
    // Demonstrates one person in two organizations with different roles.
    { userId: coffeeOwner.id, organizationId: orgs.carwash.id, role: "MANAGER", createdAt: at(-80) },
  ];

  const invitations: StoredInvitation[] = [
    {
      id: rng.uuid(),
      email: "barista@coffeepoint.kz",
      organizationId: orgs.coffee.id,
      role: "MANAGER",
      invitedById: coffeeOwner.id,
      expiresAt: at(5),
      acceptedAt: null,
      createdAt: at(-2),
      tokenHash: sha256(DEMO_INVITATION_TOKEN),
    },
    {
      id: rng.uuid(),
      email: "accountant@aquadrive.kz",
      organizationId: orgs.carwash.id,
      role: "VIEWER",
      invitedById: washOwner.id,
      expiresAt: at(-3),
      acceptedAt: null,
      createdAt: at(-10),
      tokenHash: sha256("expired-demo-invitation"),
    },
  ];

  // ── Locations, employees, redirect targets ──────────────────────────────
  const locationByKey = new Map<string, Location>();
  const specByLocationId = new Map<string, LocationSpec>();
  for (const spec of LOCATIONS) {
    const location: Location = {
      id: rng.uuid(),
      organizationId: orgs[spec.org].id,
      name: spec.name,
      address: spec.address,
      twogisFirmId: spec.firmId,
      twogisProfileUrl: spec.firmId ? `https://2gis.kz/${spec.city}/firm/${spec.firmId}` : null,
      isActive: true,
      createdAt: at(spec.installOffset - 7),
    };
    locationByKey.set(spec.key, location);
    specByLocationId.set(location.id, spec);
  }
  const locationOf = (key: string): Location => {
    const location = locationByKey.get(key);
    if (!location) throw new Error(`Unknown location ${key}`);
    return location;
  };

  const employeeByKey = new Map<string, Employee>();
  for (const spec of EMPLOYEES) {
    const location = locationOf(spec.location);
    employeeByKey.set(spec.key, {
      id: rng.uuid(),
      organizationId: location.organizationId,
      locationId: location.id,
      name: spec.name,
      position: spec.position,
      isActive: spec.isActive ?? true,
      createdAt: at(-HISTORY_DAYS),
    });
  }

  // Demo targets open real 2GIS / Google Maps search pages, so following a
  // redirect by hand lands somewhere meaningful (the firm ids are fictional).
  const targets: RedirectTarget[] = [];
  const primaryTargetByLocation = new Map<string, string>();
  for (const location of locationByKey.values()) {
    const spec = specByLocationId.get(location.id);
    if (!spec) continue;
    const query = encodeURIComponent(location.name);
    const target: RedirectTarget = spec.firmId
      ? {
          id: rng.uuid(),
          organizationId: location.organizationId,
          locationId: location.id,
          type: "TWOGIS_REVIEW",
          url: `https://2gis.kz/${spec.city}/search/${query}`,
          isVerified: true,
          createdAt: location.createdAt,
        }
      : {
          id: rng.uuid(),
          organizationId: location.organizationId,
          locationId: location.id,
          type: "GOOGLE_MAPS",
          url: `https://www.google.com/maps/search/${query}`,
          isVerified: true,
          createdAt: location.createdAt,
        };
    targets.push(target);
    primaryTargetByLocation.set(location.id, target.id);
  }
  const farabi = locationOf("wash-farabi");
  targets.push({
    id: rng.uuid(),
    organizationId: farabi.organizationId,
    locationId: farabi.id,
    type: "TWOGIS_PROFILE",
    url: `https://2gis.kz/almaty/search/${encodeURIComponent("AquaDrive")}`,
    isVerified: false,
    createdAt: at(-3),
  });

  // ── Batches and cards ───────────────────────────────────────────────────
  const batches: CardBatch[] = [
    {
      id: rng.uuid(),
      name: "Партия №1 — NFC-карточки и подставки",
      quantity: CARDS.filter((c) => c.batch === 1).length,
      cardType: "NFC_CARD",
      notes: "Первая печать, белый пластик, логотип клиента",
      createdAt: at(-HISTORY_DAYS + 5),
    },
    {
      id: rng.uuid(),
      name: "Партия №2 — стикеры и QR",
      quantity: CARDS.filter((c) => c.batch === 2).length,
      cardType: "STICKER",
      notes: null,
      createdAt: at(BATCH_2_EARLIEST_OFFSET - 5),
    },
  ];

  const usedCodes = new Set<string>();
  const nextCode = () => {
    let code: string;
    do code = generateCardCode((n) => rng.bytes(n));
    while (usedCodes.has(code));
    usedCodes.add(code);
    return code;
  };

  type CardPlan = { card: Card; spec: CardSpec; firstOffset: number; lastOffset: number };
  const nextNumber = new Map<string, number>();
  const cardPlans: CardPlan[] = CARDS.map((spec) => {
    const batch = batches[spec.batch - 1];
    if (!batch) throw new Error("Unknown batch");
    const number = (nextNumber.get(batch.id) ?? 0) + 1;
    nextNumber.set(batch.id, number);
    const location = spec.location ? locationOf(spec.location) : null;
    const locationSpec = location ? specByLocationId.get(location.id) : undefined;
    const installOffset = locationSpec?.installOffset ?? 0;
    const firstOffset =
      spec.batch === 2 ? Math.max(installOffset, BATCH_2_EARLIEST_OFFSET) + rng.int(0, 3) : installOffset;
    const employee = spec.employee ? employeeByKey.get(spec.employee) : undefined;
    const isNfc = spec.type !== "QR_ONLY" && location !== null;

    const card: Card = {
      id: rng.uuid(),
      code: nextCode(),
      batchId: batch.id,
      number,
      organizationId: location?.organizationId ?? null,
      locationId: location?.id ?? null,
      employeeId: employee?.id ?? null,
      targetId: location ? (primaryTargetByLocation.get(location.id) ?? null) : null,
      label: spec.label,
      type: spec.type,
      status: spec.status,
      nfcWritten: isNfc,
      nfcLocked: isNfc && rng.chance(0.85),
      activatedAt: location ? at(firstOffset, 9) : null,
      createdAt: batch.createdAt,
    };
    return { card, spec, firstOffset, lastOffset: spec.changedOffset ?? 0 };
  });
  const cards = cardPlans.map((plan) => plan.card);

  // ── Tap events and daily rollups ────────────────────────────────────────
  const tapEvents: TapEvent[] = [];
  const dailyStats: DailyCardStat[] = [];
  /** Valid taps per location per local date — drives review growth below. */
  const locationTaps = new Map<string, Map<string, number>>();

  const pickDevice = (): { deviceType: DeviceType; os: OperatingSystem } => {
    const deviceType = rng.weighted<DeviceType>([
      ["MOBILE", 93],
      ["TABLET", 4],
      ["DESKTOP", 2],
      ["UNKNOWN", 1],
    ]);
    if (deviceType === "DESKTOP") return { deviceType, os: rng.chance(0.6) ? "WINDOWS" : "MACOS" };
    if (deviceType === "UNKNOWN") return { deviceType, os: "OTHER" };
    return {
      deviceType,
      os: rng.weighted<OperatingSystem>([
        ["IOS", 47],
        ["ANDROID", 51],
        ["OTHER", 2],
      ]),
    };
  };

  for (const { card, spec, firstOffset, lastOffset } of cardPlans) {
    if (!card.organizationId || !card.locationId || !spec.rate) continue;
    const startOffset = Math.max(firstOffset, -(HISTORY_DAYS - 1));

    for (let offset = startOffset; offset <= lastOffset; offset++) {
      const date = addDays(today, offset);
      const ramp = Math.min(1, 0.5 + (offset - firstOffset) / 20);
      const mean = spec.rate * (WEEKDAY_FACTOR[isoWeekday(date) - 1] ?? 1) * ramp;
      const day = { taps: 0, nfcTaps: 0, qrTaps: 0 };

      for (let i = rng.poisson(mean); i > 0; i--) {
        const hour = rng.weighted(HOUR_WEIGHTS);
        if (offset === 0 && hour > currentHour) continue;
        const occurred = zonedTimeToUtc(date, { hour, minute: rng.int(0, 59), second: rng.int(0, 59) }, tz);
        if (occurred > now) continue;

        const source = card.type === "QR_ONLY" || rng.chance(0.2) ? "QR" : "NFC";
        const device = pickDevice();
        const base = {
          cardId: card.id,
          organizationId: card.organizationId,
          locationId: card.locationId,
          employeeId: card.employeeId,
          source,
        } as const;

        tapEvents.push({
          ...base,
          ...device,
          id: rng.uuid(),
          occurredAt: occurred.toISOString(),
          isBot: false,
          isDuplicate: false,
        });
        day.taps++;
        day[source === "QR" ? "qrTaps" : "nfcTaps"]++;

        if (rng.chance(DUPLICATE_SHARE)) {
          const repeated = new Date(occurred.getTime() + rng.int(1, 10) * 60_000);
          if (repeated <= now) {
            tapEvents.push({
              ...base,
              ...device,
              id: rng.uuid(),
              occurredAt: repeated.toISOString(),
              isBot: false,
              isDuplicate: true,
            });
          }
        }
        if (rng.chance(BOT_SHARE)) {
          // Link previews from messengers: no real person behind them.
          tapEvents.push({
            ...base,
            id: rng.uuid(),
            occurredAt: new Date(occurred.getTime() + rng.int(5, 600) * 1000).toISOString(),
            deviceType: "UNKNOWN",
            os: "OTHER",
            isBot: true,
            isDuplicate: false,
          });
        }
      }

      if (day.taps > 0) {
        dailyStats.push({
          cardId: card.id,
          organizationId: card.organizationId,
          locationId: card.locationId,
          employeeId: card.employeeId,
          date,
          ...day,
          uniqueVisitors: Math.max(1, day.taps - Math.floor(day.taps * rng.float(0, 0.12))),
        });
        const perDate = locationTaps.get(card.locationId) ?? new Map<string, number>();
        perDate.set(date, (perDate.get(date) ?? 0) + day.taps);
        locationTaps.set(card.locationId, perDate);
      }
    }
  }
  // Bot/duplicate offsets can push an event past "now" on the current day.
  const lastInstant = now.toISOString();
  const pastTapEvents = tapEvents
    .filter((e) => e.occurredAt <= lastInstant)
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  dailyStats.sort((a, b) => a.date.localeCompare(b.date) || a.cardId.localeCompare(b.cardId));

  // ── 2GIS rating history ─────────────────────────────────────────────────
  // Reviews trickle in before the cards and speed up after, with better scores.
  const ratingSnapshots: RatingSnapshot[] = [];
  const sampleStars = (afterInstall: boolean) =>
    rng.weighted<number>(
      afterInstall
        ? [
            [5, 78],
            [4, 15],
            [3, 4],
            [2, 2],
            [1, 1],
          ]
        : [
            [5, 55],
            [4, 25],
            [3, 10],
            [2, 5],
            [1, 5],
          ],
    );

  for (const location of locationByKey.values()) {
    const spec = specByLocationId.get(location.id);
    if (!spec?.firmId) continue;
    let reviewCount = rng.int(40, 260);
    let starSum = rng.float(4.0, 4.4) * reviewCount;
    const conversion = rng.float(0.05, 0.09);
    const installDate = addDays(today, spec.installOffset);

    for (let offset = -(HISTORY_DAYS - 1); offset <= 0; offset++) {
      const date = addDays(today, offset);
      const capturedAt = zonedTimeToUtc(date, { hour: 3 }, tz);
      if (capturedAt <= now) {
        ratingSnapshots.push({
          id: rng.uuid(),
          locationId: location.id,
          capturedAt: capturedAt.toISOString(),
          rating: round2(starSum / reviewCount),
          reviewCount,
        });
      }
      const afterInstall = date >= installDate;
      const taps = locationTaps.get(location.id)?.get(date) ?? 0;
      const newReviews = rng.poisson(afterInstall ? 0.15 + taps * conversion : 0.12);
      for (let i = 0; i < newReviews; i++) starSum += sampleStars(afterInstall);
      reviewCount += newReviews;
    }
  }

  // ── Billing ─────────────────────────────────────────────────────────────
  const subscriptions: Subscription[] = [
    {
      organizationId: orgs.coffee.id,
      plan: "BUSINESS",
      cardLimit: 30,
      paidUntil: addDays(today, 40),
      status: "ACTIVE",
    },
    // Expired: the cabinet shows blurred statistics, redirects keep working.
    {
      organizationId: orgs.beauty.id,
      plan: "START",
      cardLimit: 10,
      paidUntil: addDays(today, -20),
      status: "EXPIRED",
    },
    // In grace period.
    {
      organizationId: orgs.carwash.id,
      plan: "NETWORK",
      cardLimit: 100,
      paidUntil: addDays(today, -3),
      status: "ACTIVE",
    },
  ];

  const payment = (org: OrgKey, offset: number, amountKzt: number, method: Payment["method"]): Payment => ({
    id: rng.uuid(),
    organizationId: orgs[org].id,
    amountKzt,
    paidAt: at(offset, 11),
    method,
    comment: null,
    recordedById: admin.id,
  });
  const payments: Payment[] = [
    payment("coffee", -80, 19_900, "KASPI"),
    payment("coffee", -50, 19_900, "KASPI"),
    payment("coffee", -10, 19_900, "KASPI"),
    payment("beauty", -50, 9_900, "CASH"),
    payment("carwash", -64, 49_900, "BANK_TRANSFER"),
    { ...payment("carwash", -33, 49_900, "BANK_TRANSFER"), comment: "Счёт №118" },
  ].sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  // ── Inbox ───────────────────────────────────────────────────────────────
  const tickets: SupportTicket[] = [
    {
      id: rng.uuid(),
      organizationId: orgs.coffee.id,
      authorId: coffeeOwner.id,
      subject: "Изменить ссылку 2ГИС для филиала на Достык",
      body: "Мы переехали в соседнее здание, в 2ГИС теперь новая карточка организации.",
      status: "IN_PROGRESS",
      assigneeId: support.id,
      createdAt: at(-3, 15),
      updatedAt: at(-2, 10),
    },
    {
      id: rng.uuid(),
      organizationId: orgs.beauty.id,
      authorId: beautyOwner.id,
      subject: "Как продлить подписку?",
      body: "Статистика перестала открываться. Хотим продлить тариф, можно оплатить через Kaspi?",
      status: "NEW",
      assigneeId: null,
      createdAt: at(-1, 12),
      updatedAt: at(-1, 12),
    },
    {
      id: rng.uuid(),
      organizationId: orgs.carwash.id,
      authorId: washOwner.id,
      subject: "Не срабатывает карточка на кассе",
      body: "Гости говорят, что телефон не реагирует на карточку на кассе в филиале Рыскулова.",
      status: "CLOSED",
      assigneeId: admin.id,
      createdAt: at(-30, 10),
      updatedAt: at(-28, 16),
    },
  ];
  const comments: InternalComment[] = [
    {
      id: rng.uuid(),
      subjectType: "TICKET",
      subjectId: tickets[0]?.id ?? "",
      authorId: support.id,
      body: "Запросил у клиента новую ссылку на 2ГИС, жду ответа.",
      createdAt: at(-2, 10),
    },
  ];

  const leads: Lead[] = [
    {
      id: rng.uuid(),
      name: "Ерке Нурланова",
      phone: "+77071112233",
      businessName: "Кафе «Жеты Казына»",
      city: "Алматы",
      message: "Нужно около 10 карточек на столы.",
      status: "NEW",
      assigneeId: null,
      createdAt: at(0, 8),
    },
    {
      id: rng.uuid(),
      name: "Ринат Галиев",
      phone: "+77474445566",
      businessName: "Барбершоп «Brutal»",
      city: "Астана",
      message: null,
      status: "IN_PROGRESS",
      assigneeId: admin.id,
      createdAt: at(-4, 17),
    },
    {
      id: rng.uuid(),
      name: "Сауле Омарова",
      phone: "+77012223344",
      businessName: "Стоматология «Smile»",
      city: "Шымкент",
      message: "Интересует тариф для сети из трёх клиник.",
      status: "CONVERTED",
      assigneeId: admin.id,
      createdAt: at(-15, 11),
    },
  ];

  // ── Audit trail and settings ────────────────────────────────────────────
  const firstCoffeeCard = cards.find((c) => c.organizationId === orgs.coffee.id);
  const auditEntries: AuditLog[] = [
    {
      id: rng.uuid(),
      actorUserId: admin.id,
      action: "organization.create",
      entityType: "organization",
      entityId: orgs.coffee.id,
      organizationId: orgs.coffee.id,
      before: null,
      after: { name: orgs.coffee.name },
      createdAt: orgs.coffee.createdAt,
    },
    {
      id: rng.uuid(),
      actorUserId: admin.id,
      action: "card.assign",
      entityType: "card",
      entityId: firstCoffeeCard?.id ?? null,
      organizationId: orgs.coffee.id,
      before: { status: "UNASSIGNED", organizationId: null },
      after: { status: "ACTIVE", organizationId: orgs.coffee.id },
      createdAt: at(-60, 9),
    },
    {
      id: rng.uuid(),
      actorUserId: admin.id,
      action: "payment.create",
      entityType: "payment",
      entityId: payments.find((p) => p.organizationId === orgs.coffee.id)?.id ?? null,
      organizationId: orgs.coffee.id,
      before: null,
      after: { amountKzt: 19_900, method: "KASPI" },
      createdAt: at(-10, 11),
    },
    {
      id: rng.uuid(),
      actorUserId: null,
      action: "subscription.status_change",
      entityType: "subscription",
      entityId: orgs.beauty.id,
      organizationId: orgs.beauty.id,
      before: { status: "GRACE" },
      after: { status: "EXPIRED" },
      createdAt: at(-12, 0, 5),
    },
  ];
  const auditLogs = auditEntries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const notificationSettings: NotificationSetting[] = [
    {
      userId: coffeeOwner.id,
      organizationId: orgs.coffee.id,
      weeklyReportEmail: true,
      lowActivityAlert: true,
    },
    {
      userId: coffeeManager.id,
      organizationId: orgs.coffee.id,
      weeklyReportEmail: false,
      lowActivityAlert: true,
    },
    {
      userId: washOwner.id,
      organizationId: orgs.carwash.id,
      weeklyReportEmail: true,
      lowActivityAlert: false,
    },
  ];

  return {
    users,
    memberships,
    invitations,
    organizations: Object.values(orgs),
    locations: [...locationByKey.values()],
    employees: [...employeeByKey.values()],
    targets,
    ratingSnapshots,
    batches,
    cards,
    tapEvents: pastTapEvents,
    dailyStats,
    subscriptions,
    payments,
    tickets,
    leads,
    comments,
    auditLogs,
    notificationSettings,
    platformSettings: structuredClone(defaultPlatformSettings),
  };
}
