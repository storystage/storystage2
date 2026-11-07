/**
 * What a paint looks like: a name from the Story API's `Color` list, a `#rrggbb` colour, or a
 * Backstage surface. A paint tints a model's surface, as in Alice, so white leaves it as it was
 * made. The named colours are Alice's.
 */
import type { BackstageId, ENUMS } from '@storystage/story-api';
import { groundColour, type Colour } from './backdrops.ts';

const bytes = (r: number, g: number, b: number): Colour => ({ r: r / 255, g: g / 255, b: b / 255 });

const NAMED: Readonly<Record<(typeof ENUMS.Color)[number], Colour>> = {
  black: bytes(0, 0, 0),
  blue: bytes(0, 0, 255),
  cyan: bytes(0, 255, 255),
  darkGray: bytes(64, 64, 64),
  gray: bytes(128, 128, 128),
  green: bytes(0, 255, 0),
  lightGray: bytes(192, 192, 192),
  magenta: bytes(255, 0, 255),
  orange: bytes(255, 200, 0),
  pink: bytes(255, 175, 175),
  red: bytes(255, 0, 0),
  white: bytes(255, 255, 255),
  yellow: bytes(255, 255, 0),
  lightBlue: bytes(149, 166, 216),
  darkBlue: bytes(0, 0, 150),
  purple: bytes(128, 0, 128),
  brown: bytes(162, 42, 42),
};

/** The colour of a paint, or null if there's no such paint. */
export function paintColour(paint: string): Colour | null {
  if (Object.hasOwn(NAMED, paint)) return NAMED[paint as keyof typeof NAMED];
  if (/^#[0-9a-f]{6}$/i.test(paint)) {
    const n = parseInt(paint.slice(1), 16);
    return bytes((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  return groundColour(paint as BackstageId);
}
