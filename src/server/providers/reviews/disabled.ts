import type { FirmPreview, FirmStats, ReviewsProvider } from "./types";

/**
 * Stand-in while the 2GIS integration is switched off (`features.twogisApi`): it
 * resolves nothing and refuses to invent figures, unlike the demo provider.
 */
export class DisabledReviewsProvider implements ReviewsProvider {
  readonly name = "disabled";
  readonly isConnected = false;

  async resolveFirm(): Promise<FirmPreview | null> {
    return null;
  }

  async fetchStats(): Promise<FirmStats> {
    throw new Error("The 2GIS integration is not configured");
  }
}
