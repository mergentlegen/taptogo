export const settingsTabs = ["profile", "security", "organization", "notifications", "subscription"] as const;
export type SettingsTab = (typeof settingsTabs)[number];
