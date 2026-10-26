import { randomInt } from "node:crypto";

/** Letters and digits without look-alikes (0/O, 1/l/I), so it can be read out over the phone. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export const TEMPORARY_PASSWORD_LENGTH = 12;

/** Random, so it is never a common password; checked against the same policy as user-chosen ones. */
export function generateTemporaryPassword(): string {
  return Array.from({ length: TEMPORARY_PASSWORD_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
    "",
  );
}
