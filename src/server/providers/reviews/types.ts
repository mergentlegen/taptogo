/** What we can show about a 2GIS organization before linking it to a location. */
export type FirmPreview = {
  firmId: string;
  name: string;
  address: string;
  rating: number | null;
  reviewCount: number | null;
  profileUrl: string;
  reviewsUrl: string;
};

export type FirmStats = {
  firmId: string;
  rating: number | null;
  reviewCount: number | null;
  capturedAt: string;
};

/**
 * Source of public rating data (2GIS Places API later). Review texts are not
 * part of the contract: the official API does not provide them.
 */
export interface ReviewsProvider {
  readonly name: string;
  /** Whether a real external integration is configured (drives the admin "connected" badge). */
  readonly isConnected: boolean;
  /** Resolves a pasted 2GIS link to a firm; null when the link is not a 2GIS organization. */
  resolveFirm(url: string): Promise<FirmPreview | null>;
  fetchStats(firmId: string): Promise<FirmStats>;
}
