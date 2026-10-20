export const CARD_CODE_LENGTH = 8;
export const CARD_CODE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const CARD_CODE_PATTERN = /^[A-Za-z0-9]{8}$/;

export function isCardCode(value: string): boolean {
  return CARD_CODE_PATTERN.test(value);
}

/** Largest multiple of 62 that fits in a byte; bytes above it are discarded to avoid modulo bias. */
const UNBIASED_BYTE_LIMIT = 256 - (256 % CARD_CODE_ALPHABET.length);

type RandomBytes = (length: number) => Uint8Array;

const cryptoRandomBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

/**
 * 8 base62 characters from a CSPRNG: 62^8 ≈ 2.18·10^14 codes, so guessing a
 * valid one is impractical (and /t/{code} is rate limited on top).
 */
export function generateCardCode(randomBytes: RandomBytes = cryptoRandomBytes): string {
  let code = "";
  while (code.length < CARD_CODE_LENGTH) {
    for (const byte of randomBytes(CARD_CODE_LENGTH * 2)) {
      if (byte >= UNBIASED_BYTE_LIMIT) continue;
      code += CARD_CODE_ALPHABET[byte % CARD_CODE_ALPHABET.length];
      if (code.length === CARD_CODE_LENGTH) break;
    }
  }
  return code;
}

/** Generates `count` codes that collide neither with each other nor with `taken`. */
export function generateUniqueCardCodes(
  count: number,
  taken: ReadonlySet<string>,
  randomBytes?: RandomBytes,
): string[] {
  const result = new Set<string>();
  while (result.size < count) {
    const code = generateCardCode(randomBytes);
    if (!taken.has(code)) result.add(code);
  }
  return [...result];
}
