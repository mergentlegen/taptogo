import type { RatingSnapshot } from "@/features/locations/schemas";
import { addDays, toLocalDate, type IsoDate } from "@/lib/dates";

/**
 * Rating snapshots are taken daily at night; the snapshot dated D holds the
 * state at the start of day D. These helpers read "how things stood" on a
 * given date across one or more locations.
 */
export class RatingHistory {
  private readonly byLocation = new Map<string, { date: IsoDate; snapshot: RatingSnapshot }[]>();

  constructor(snapshots: readonly RatingSnapshot[], timeZone: string) {
    for (const snapshot of snapshots) {
      const list = this.byLocation.get(snapshot.locationId) ?? [];
      list.push({ date: toLocalDate(snapshot.capturedAt, timeZone), snapshot });
      this.byLocation.set(snapshot.locationId, list);
    }
    for (const list of this.byLocation.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  }

  get hasData(): boolean {
    return this.byLocation.size > 0;
  }

  /** Latest snapshot of a location taken on or before `date`. */
  at(locationId: string, date: IsoDate): RatingSnapshot | null {
    const list = this.byLocation.get(locationId);
    if (!list) return null;
    let found: RatingSnapshot | null = null;
    for (const entry of list) {
      if (entry.date > date) break;
      found = entry.snapshot;
    }
    return found;
  }

  /** Total reviews across locations at the start of `date` (null if none known). */
  reviewCountAt(locationIds: readonly string[], date: IsoDate): number | null {
    let total: number | null = null;
    for (const id of locationIds) {
      const count = this.at(id, date)?.reviewCount;
      if (count !== null && count !== undefined) total = (total ?? 0) + count;
    }
    return total;
  }

  /** Review-count-weighted average rating across locations at the start of `date`. */
  ratingAt(locationIds: readonly string[], date: IsoDate): number | null {
    let weighted = 0;
    let weight = 0;
    for (const id of locationIds) {
      const snapshot = this.at(id, date);
      if (snapshot?.rating === null || snapshot?.rating === undefined) continue;
      const w = Math.max(1, snapshot.reviewCount ?? 1);
      weighted += snapshot.rating * w;
      weight += w;
    }
    return weight ? weighted / weight : null;
  }

  /** Net change in the public review count, including removals. */
  newReviews(locationIds: readonly string[], from: IsoDate, to: IsoDate): number | null {
    const start = this.reviewCountAt(locationIds, from);
    const end = this.reviewCountAt(locationIds, addDays(to, 1));
    return start === null || end === null ? null : end - start;
  }
}
