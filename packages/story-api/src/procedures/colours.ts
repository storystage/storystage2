/**
 * Alice's named colours, as she defines them (`Color4f`), in bytes. The stage paints with them
 * and the Story API names a colour the stage reports back with them.
 */
import type { ENUMS } from '../catalog/types.ts';

export type ColorName = (typeof ENUMS.Color)[number];

export const COLOR_BYTES: Readonly<Record<ColorName, readonly [number, number, number]>> = {
  black: [0, 0, 0],
  blue: [0, 0, 255],
  cyan: [0, 255, 255],
  darkGray: [64, 64, 64],
  gray: [128, 128, 128],
  green: [0, 255, 0],
  lightGray: [192, 192, 192],
  magenta: [255, 0, 255],
  orange: [255, 200, 0],
  pink: [255, 175, 175],
  red: [255, 0, 0],
  white: [255, 255, 255],
  yellow: [255, 255, 0],
  lightBlue: [149, 166, 216],
  darkBlue: [0, 0, 150],
  purple: [128, 0, 128],
  brown: [162, 42, 42],
};

/** The colour name for a `#rrggbb`, if it's one of Alice's exactly. */
export function colorName(rrggbb: string): ColorName | null {
  const hex = rrggbb.toLowerCase();
  for (const [name, [r, g, b]] of Object.entries(COLOR_BYTES))
    if (hex === `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`)
      return name as ColorName;
  return null;
}
