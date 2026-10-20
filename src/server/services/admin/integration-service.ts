import type { RatingSnapshot } from "@/features/locations/schemas";
import { serviceError } from "@/server/i18n";
import type { ReviewsProvider } from "@/server/providers/reviews/types";
import type { Repositories } from "@/server/repositories";
import type { AuditService } from "@/server/services/audit-service";

import { assertAdmin, type AdminContext } from "./context";

/** Manual re-sync of one location is allowed at most once an hour (protects the API quota). */
export const MANUAL_SYNC_INTERVAL_MS = 60 * 60 * 1000;

export type IntegrationRow = {
  locationId: string;
  location: string;
  organization: string;
  firmId: string | null;
  lastSnapshot: RatingSnapshot | null;
};

export class AdminIntegrationService {
  constructor(
    private readonly repositories: Repositories,
    private readonly reviews: ReviewsProvider,
    private readonly audit: AuditService,
    private readonly clock: () => Date,
  ) {}

  async status(): Promise<{ provider: string; connected: boolean; locations: IntegrationRow[] }> {
    const repos = this.repositories;
    const [locations, organizations] = await Promise.all([
      repos.locations.list(),
      repos.organizations.list(),
    ]);
    const snapshots = await repos.ratingSnapshots.latestForLocations(locations.map((l) => l.id));
    return {
      provider: this.reviews.name,
      connected: this.reviews.isConnected,
      locations: locations.map((l) => ({
        locationId: l.id,
        location: l.name,
        organization: organizations.find((o) => o.id === l.organizationId)?.name ?? "—",
        firmId: l.twogisFirmId,
        lastSnapshot: snapshots.find((s) => s.locationId === l.id) ?? null,
      })),
    };
  }

  /** Fetches current rating/review count and stores a snapshot. */
  async sync(ctx: AdminContext, locationId: string, { force = false } = {}): Promise<RatingSnapshot> {
    assertAdmin(ctx, "admin.manage");
    const location = await this.repositories.locations.findById(locationId);
    if (!location) throw serviceError("NOT_FOUND", "locationNotFound");
    if (!location.twogisFirmId) throw serviceError("VALIDATION", "notLinked");

    const [latest] = await this.repositories.ratingSnapshots.latestForLocations([locationId]);
    const now = this.clock();
    if (!force && latest && now.getTime() - new Date(latest.capturedAt).getTime() < MANUAL_SYNC_INTERVAL_MS) {
      throw serviceError("RATE_LIMITED", "syncTooOften");
    }

    const stats = await this.reviews.fetchStats(location.twogisFirmId);
    const snapshot = await this.repositories.ratingSnapshots.create({
      locationId,
      capturedAt: now.toISOString(),
      rating: stats.rating,
      reviewCount: stats.reviewCount,
    });
    await this.audit.record({
      actorUserId: ctx.userId,
      action: "integration.sync",
      entityType: "location",
      entityId: locationId,
      organizationId: location.organizationId,
      after: { rating: snapshot.rating, reviewCount: snapshot.reviewCount, provider: this.reviews.name },
    });
    return snapshot;
  }

  /** Syncs every linked location that isn't inside its hourly window. */
  async syncAll(ctx: AdminContext): Promise<{ synced: number; skipped: number }> {
    assertAdmin(ctx, "admin.manage");
    let synced = 0;
    let skipped = 0;
    for (const location of await this.repositories.locations.list({ isActive: true })) {
      if (!location.twogisFirmId) continue;
      try {
        await this.sync(ctx, location.id);
        synced++;
      } catch {
        skipped++;
      }
    }
    return { synced, skipped };
  }
}
