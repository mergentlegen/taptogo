export const settingsTabs = ["profile", "security", "organization"] as const;
export type SettingsTab = (typeof settingsTabs)[number];
