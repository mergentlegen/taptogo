import { parseTwogisFirmUrl, twogisProfileUrl, twogisReviewsUrl } from "@/features/locations/twogis-url";

import type { FirmPreview, FirmStats, ReviewsProvider } from "./types";

export type KnownFirm = {
  firmId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number | null;
};

/** Small stable hash so unknown firm ids still get the same fake figures every time. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Offline stand-in for the 2GIS Places API. Firms that exist in demo data
 * return their real demo figures; any other firm id gets deterministic
 * pseudo-random ones.
 */
export class MockReviewsProvider implements ReviewsProvider {
  readonly name = "mock";
  readonly isConnected = false;

  constructor(
    private readonly lookupFirm: (firmId: string) => KnownFirm | null,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async resolveFirm(url: string): Promise<FirmPreview | null> {
    const parsed = parseTwogisFirmUrl(url);
    if (!parsed) return null;

    const firm = this.lookupFirm(parsed.firmId) ?? this.fakeFirm(parsed.firmId);
    return {
      ...firm,
      profileUrl: twogisProfileUrl(parsed),
      reviewsUrl: twogisReviewsUrl(parsed),
    };
  }

  async fetchStats(firmId: string): Promise<FirmStats> {
    const firm = this.lookupFirm(firmId) ?? this.fakeFirm(firmId);
    return {
      firmId,
      rating: firm.rating,
      reviewCount: firm.reviewCount,
      capturedAt: this.clock().toISOString(),
    };
  }

  private fakeFirm(firmId: string): KnownFirm {
    const hash = hashString(firmId);
    return {
      firmId,
      name: `Организация ${firmId.slice(-4)}`,
      address: "Алматы",
      rating: Math.round((3.8 + (hash % 110) / 100) * 10) / 10,
      reviewCount: 20 + (hash % 480),
    };
  }
}
