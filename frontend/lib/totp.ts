import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Six digit codes, the kind Google Authenticator shows.
 *
 * Written out rather than pulled in, because the whole algorithm is thirty lines of
 * standard HMAC and the alternative is a dependency in the tree for something this small.
 * RFC 6238, which is HMAC-SHA1 over a 30 second counter with the last four bits of the
 * digest choosing where to read the number from.
 */
const STEP_SECONDS = 30;
const DIGITS = 6;

/**
 * How many steps either side of now are accepted.
 *
 * One, so a phone thirty seconds out still works. Wider would be kinder and would also
 * widen the window in which a code somebody read over your shoulder is still good.
 */
const DRIFT_STEPS = 1;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** A fresh secret, in the base32 Authenticator apps expect. */
export function newSecret() {
  const bytes = randomBytes(20);
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += ALPHABET[Number.parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function fromBase32(secret: string) {
  const clean = secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of clean) {
    const index = ALPHABET.indexOf(character);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function codeAt(secret: string, counter: number) {
  const message = Buffer.alloc(8);
  message.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  message.writeUInt32BE(counter >>> 0, 4);

  const digest = createHmac("sha1", fromBase32(secret)).update(message).digest();
  // Dynamic truncation: the low nibble of the last byte says where to read four bytes
  // from, and the top bit is masked off so the result is never negative.
  const offset = digest[digest.length - 1] & 0x0f;
  const value =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];

  return String(value % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Whether this code is currently valid.
 *
 * Compared byte by byte in constant time. A plain string compare returns faster on a wrong
 * first digit than on a wrong last one, and that difference is enough to guess a code one
 * position at a time given enough attempts.
 */
export function verifyCode(secret: string, code: string) {
  const given = code.replace(/\D/g, "");
  if (given.length !== DIGITS) return false;

  const now = Math.floor(Date.now() / 1000 / STEP_SECONDS);
  for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift++) {
    const expected = Buffer.from(codeAt(secret, now + drift));
    const actual = Buffer.from(given);
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) return true;
  }
  return false;
}

/** The string an Authenticator app reads out of a QR code. */
export function otpauthUri(secret: string, label = "Trustfall admin") {
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=Trustfall`;
}
