import "server-only";

import QRCode from "qrcode";

import { getEnv } from "@/env";

/** Public card URL; the QR variant carries ?s=q so scans are counted as QR. */
export function cardUrl(code: string, source: "nfc" | "qr"): string {
  const url = new URL(`/t/${code}`, getEnv().APP_URL);
  if (source === "qr") url.searchParams.set("s", "q");
  return url.toString();
}

const options = {
  errorCorrectionLevel: "M",
  margin: 2,
  color: { dark: "#111111", light: "#ffffff" },
} as const;

export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { ...options, type: "svg" });
}

export function qrPng(text: string, width = 1024): Promise<Buffer> {
  return QRCode.toBuffer(text, { ...options, type: "png", width });
}
