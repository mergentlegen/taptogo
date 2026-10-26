/**
 * Switches for parts of the product that are built but switched off.
 * Set a flag to `true` to bring the feature back; nothing else changes.
 */
export const features = {
  /**
   * 2ГИС API integration: ratings and review counts (dashboard, locations,
   * reports), live rating sync, the integrations page and the link preview in the
   * client wizard. Off until a paid API key is available: none of it is shown or loaded.
   * Card links to the 2ГИС review page do not depend on this flag.
   */
  twogisApi: false,
} as const;
