import { describe, expect, it } from "vitest";

import { detectDeviceType, detectOperatingSystem, isBotUserAgent } from "./user-agent";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const ANDROID_PHONE =
  "Mozilla/5.0 (Linux; Android 15; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";
const ANDROID_TABLET =
  "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const IPAD =
  "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1";
const WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15";

describe("detectOperatingSystem / detectDeviceType", () => {
  it.each([
    [IPHONE, "IOS", "MOBILE"],
    [ANDROID_PHONE, "ANDROID", "MOBILE"],
    [ANDROID_TABLET, "ANDROID", "TABLET"],
    [IPAD, "IOS", "TABLET"],
    [WINDOWS, "WINDOWS", "DESKTOP"],
    [MAC, "MACOS", "DESKTOP"],
  ])("%s → %s / %s", (ua, os, device) => {
    expect(detectOperatingSystem(ua)).toBe(os);
    expect(detectDeviceType(ua)).toBe(device);
  });

  it("falls back to OTHER / UNKNOWN", () => {
    expect(detectOperatingSystem(null)).toBe("OTHER");
    expect(detectDeviceType("SomethingElse/1.0")).toBe("UNKNOWN");
  });
});

describe("isBotUserAgent", () => {
  it.each([
    "WhatsApp/2.24.1 A",
    "TelegramBot (like TwitterBot)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Mozilla/5.0 (compatible; YandexBot/3.0)",
    "curl/8.7.1",
    "python-requests/2.32",
    "",
    null,
  ])("flags %j", (ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it.each([IPHONE, ANDROID_PHONE, WINDOWS])("lets real browsers through", (ua) => {
    expect(isBotUserAgent(ua)).toBe(false);
  });
});
