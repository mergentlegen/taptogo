import type { DeviceType, OperatingSystem } from "./schemas";

/**
 * Link-preview bots of messengers and social networks, search crawlers and
 * command-line tools. Their hits are stored (flagged) but never counted.
 */
const BOT_PATTERN =
  /bot\b|crawler|spider|preview|facebookexternalhit|facebot|whatsapp|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|vkshare|skypeuripreview|okhttp|headless|lighthouse|curl\/|wget\/|python-requests|httpclient|go-http-client|axios\//i;

export function isBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent || userAgent.trim().length < 10) return true;
  return BOT_PATTERN.test(userAgent);
}

export function detectOperatingSystem(userAgent: string | null): OperatingSystem {
  if (!userAgent) return "OTHER";
  if (/iphone|ipad|ipod/i.test(userAgent)) return "IOS";
  if (/android/i.test(userAgent)) return "ANDROID";
  if (/windows/i.test(userAgent)) return "WINDOWS";
  if (/mac os x|macintosh/i.test(userAgent)) return "MACOS";
  if (/linux|x11/i.test(userAgent)) return "LINUX";
  return "OTHER";
}

export function detectDeviceType(userAgent: string | null): DeviceType {
  if (!userAgent) return "UNKNOWN";
  if (/ipad|tablet|kindle|silk|playbook/i.test(userAgent)) return "TABLET";
  // Android phones say "Mobile"; Android tablets don't.
  if (/android/i.test(userAgent)) return /mobile/i.test(userAgent) ? "MOBILE" : "TABLET";
  if (/iphone|ipod|mobile|opera mini|iemobile/i.test(userAgent)) return "MOBILE";
  if (/windows|macintosh|mac os x|x11|linux|cros/i.test(userAgent)) return "DESKTOP";
  return "UNKNOWN";
}
