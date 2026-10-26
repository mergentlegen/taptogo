import "server-only";

import { getEnv } from "@/env";
import type { OrgRole } from "@/features/team/schemas";
import type { PlatformRole } from "@/features/users/schemas";
import { getMockDatabase, type MockDatabase } from "@/mocks/db";
import { DEMO_INVITATION_TOKEN, DEMO_PASSWORD, demoAccounts } from "@/mocks/seed";
import { MockAuthService } from "@/server/auth/mock-auth-service";
import type { AuthService, ClientInfo, SignInResult } from "@/server/auth/types";
import { ManualOutbox } from "@/server/providers/email/manual";
import type { EmailProvider } from "@/server/providers/email/types";
import { MockReviewsProvider } from "@/server/providers/reviews/mock";
import type { ReviewsProvider } from "@/server/providers/reviews/types";
import type { Repositories } from "@/server/repositories";
import { createMockRepositories } from "@/server/repositories/mock";
import { InMemoryRateLimiter, type RateLimiter } from "@/server/security/rate-limiter";
import { AuditService } from "@/server/services/audit-service";
import { processSingleton } from "@/server/singleton";

/**
 * The only place that knows which implementations are in use. Pages,
 * actions and services receive these interfaces and never import mocks.
 */
export type Container = {
  /** Data access on behalf of the signed-in user (Supabase: user JWT, so RLS applies). */
  repositories: Repositories;
  /**
   * Data access with no user behind the request (Supabase: service role, RLS
   * bypassed). Only for flows that have no session by nature: the card
   * redirect and tap recording, landing-page leads, authentication itself
   * (sign-in, invitations, password reset) and scheduled jobs. The calling
   * service is responsible for every check. In mock mode it is the same
   * object as `repositories`.
   */
  systemRepositories: Repositories;
  auth: AuthService;
  /** Audit trail written as the signed-in user. */
  audit: AuditService;
  /** Audit trail for system and anonymous actions (actor may be null). */
  systemAudit: AuditService;
  rateLimiter: RateLimiter;
  email: EmailProvider;
  reviews: ReviewsProvider;
  /** Messages waiting for manual sending by an administrator (/admin/outbox). */
  outbox: ManualOutbox;
  /** Demo accounts for the dev "Sign in as…" block; null outside mock mode. */
  demo: DemoInfo | null;
  clock: () => Date;
};

export type DemoInfo = {
  password: string;
  accounts: readonly { email: string; role: PlatformRole | OrgRole }[];
  signIn: (email: string, client: ClientInfo) => Promise<SignInResult>;
  /** Raw token of the seeded pending invitation, for trying the invite flow. */
  invitationToken: string;
};

export function getContainer(): Container {
  return processSingleton("container", () => {
    const { DATA_SOURCE } = getEnv();
    switch (DATA_SOURCE) {
      case "mock":
        return createMockContainer(getMockDatabase());
      // case "supabase": return createSupabaseContainer(); — see docs/SUPABASE_MIGRATION.md
    }
  });
}

export function createMockContainer(db: MockDatabase, clock: () => Date = () => new Date()): Container {
  const env = getEnv();
  const repositories = createMockRepositories({ db, clock, newId: () => crypto.randomUUID() });
  const outbox = new ManualOutbox(clock);
  // One in-memory store serves both; Supabase will use two clients here.
  const systemRepositories = repositories;
  const audit = new AuditService(repositories.auditLogs);
  const systemAudit = new AuditService(systemRepositories.auditLogs);
  const rateLimiter = new InMemoryRateLimiter(clock);
  const auth = new MockAuthService({
    repositories: systemRepositories,
    email: outbox,
    rateLimiter,
    audit: systemAudit,
    clock,
    sessionSecret: env.SESSION_SECRET,
    appUrl: env.APP_URL,
    demoPassword: DEMO_PASSWORD,
    demoUserIds: new Set(db.users.map((u) => u.id)),
  });

  const lookupFirm = (firmId: string) => {
    const location = db.locations.find((l) => l.twogisFirmId === firmId);
    if (!location) return null;
    const latest = db.ratingSnapshots
      .filter((s) => s.locationId === location.id)
      .reduce<(typeof db.ratingSnapshots)[number] | null>(
        (best, s) => (!best || s.capturedAt > best.capturedAt ? s : best),
        null,
      );
    return {
      firmId,
      name: location.name,
      address: location.address,
      rating: latest?.rating ?? null,
      reviewCount: latest?.reviewCount ?? null,
    };
  };

  return {
    repositories,
    systemRepositories,
    auth,
    audit,
    systemAudit,
    rateLimiter,
    email: outbox,
    reviews: new MockReviewsProvider(lookupFirm, clock),
    outbox,
    demo: {
      password: DEMO_PASSWORD,
      accounts: demoAccounts,
      signIn: (address, client) => auth.signInAsDemo(address, client),
      invitationToken: DEMO_INVITATION_TOKEN,
    },
    clock,
  };
}
