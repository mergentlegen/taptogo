export type ImageType = {
  mime: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
};

/**
 * Detects the real image type from the file's first bytes ("magic numbers").
 * The browser-provided MIME type and file name are never trusted.
 */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  const starts = (signature: number[], offset = 0) => signature.every((b, i) => bytes[offset + i] === b);

  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { mime: "image/png", extension: "png" };
  if (starts([0xff, 0xd8, 0xff])) return { mime: "image/jpeg", extension: "jpg" };
  // RIFF....WEBP
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) {
    return { mime: "image/webp", extension: "webp" };
  }
  return null;
}
