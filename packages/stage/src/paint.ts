/**
 * What a paint looks like: a name from the Story API's `Color` list, a `#rrggbb` colour, or a
 * Backstage surface. A paint tints a model's surface, as in Alice, so white leaves it as it was
 * made. The named colours are Alice's, from the Story API (`COLOR_BYTES`).
 */
import { COLOR_BYTES, type BackstageId } from '@storystage/story-api';
import { groundColour, type Colour } from './backdrops.ts';

const bytes = (r: number, g: number, b: number): Colour => ({ r: r / 255, g: g / 255, b: b / 255 });

/** The colour of a paint, or null if there's no such paint. */
export function paintColour(paint: string): Colour | null {
  if (Object.hasOwn(COLOR_BYTES, paint)) {
    const [r, g, b] = COLOR_BYTES[paint as keyof typeof COLOR_BYTES];
    return bytes(r, g, b);
  }
  if (/^#[0-9a-f]{6}$/i.test(paint)) {
    const n = parseInt(paint.slice(1), 16);
    return bytes((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  return groundColour(paint as BackstageId);
}
