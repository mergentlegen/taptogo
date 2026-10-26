/**
 * Switches for parts of the product that are built but switched off.
 * Set a flag to `true` to bring the feature back; nothing else changes.
 */
export const features = {
  /**
   * 2ГИС API integration: live rating sync, the integrations page and the
   * link preview in the client wizard. Off until a paid API key is available.
   * Ratings already shown come from demo data, not from this flag.
   */
  twogisApi: false,
} as const;
