import { ENUMS } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { GROUND_TYPES } from './backdrops.ts';
import { paintColour } from './paint.ts';

describe('paint', () => {
  it('has a colour for every name in the Story API', () => {
    for (const name of ENUMS.Color) expect(paintColour(name), name).not.toBeNull();
  });

  it("uses Alice's colours", () => {
    expect(paintColour('orange')).toEqual({ r: 1, g: 200 / 255, b: 0 });
    expect(paintColour('brown')).toEqual({ r: 162 / 255, g: 42 / 255, b: 42 / 255 });
  });

  it('reads a #rrggbb colour', () => {
    expect(paintColour('#336699')).toEqual({ r: 0.2, g: 0.4, b: 0.6 });
    expect(paintColour('#FFFFFF')).toEqual({ r: 1, g: 1, b: 1 });
  });

  it('can be a Backstage surface', () => {
    expect(paintColour(GROUND_TYPES[0]!)).not.toBeNull();
  });

  it('refuses anything else', () => {
    for (const bad of ['', 'rainbow', '#12', '#gggggg', 'toString', 'constructor'])
      expect(paintColour(bad), bad).toBeNull();
  });
});
