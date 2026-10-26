export const settingsTabs = ["profile", "security", "organization", "subscription"] as const;
export type SettingsTab = (typeof settingsTabs)[number];
