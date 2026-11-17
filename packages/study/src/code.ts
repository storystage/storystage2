/**
 * A session's code (spec 14, 6.3): eight symbols drawn evenly from 31, about 40 bits, from the
 * system's random numbers only. It is made from nothing else (not the device, the pupil or the
 * time), so two sessions can't be joined up by their codes.
 */

/** Letters and digits a child can read back: no 0, O, 1, I or L. */
export const CODE_SYMBOLS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 8;

const CODE = /^[2-9A-HJKMNP-Z]{8}$/;

/** Fills the array with random bytes: the system's, unless a test gives its own. */
export type RandomBytes = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array;

const systemRandom: RandomBytes = (bytes) => crypto.getRandomValues(bytes);

/** 248 is the largest multiple of 31 under 256: bytes from it up are dropped, so each symbol is as likely. */
const LIMIT = CODE_SYMBOLS.length * Math.floor(256 / CODE_SYMBOLS.length);

export function newCode(random: RandomBytes = systemRandom): string {
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const byte of random(new Uint8Array(16))) {
      if (byte >= LIMIT) continue;
      code += CODE_SYMBOLS[byte % CODE_SYMBOLS.length];
      if (code.length === CODE_LENGTH) break;
    }
  }
  return code;
}

export const isCode = (value: unknown): value is string =>
  typeof value === 'string' && CODE.test(value);

/** As the study bar shows it: "K7P3-QX2M". */
export const showCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;
