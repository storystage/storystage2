import { StageError, backstageId } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import {
  BACKDROP_TEMPLATES,
  GROUND_TYPES,
  PICTURE_SKY_TYPES,
  fogDensity,
  groundLook,
  resolveBackdrop,
} from './backdrops.ts';

const template = (id: string) => {
  const found = BACKDROP_TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`no template ${id}`);
  return resolveBackdrop(found.backdrop);
};

describe('backdrops', () => {
  it("keeps all 20 of Alice's starting templates", () => {
    expect(BACKDROP_TEMPLATES).toHaveLength(20);
    expect(new Set(BACKDROP_TEMPLATES.map((t) => t.id)).size).toBe(20);
    expect(new Set(BACKDROP_TEMPLATES.map((t) => t.name)).size).toBe(20);
  });

  it('resolves every template', () => {
    for (const t of BACKDROP_TEMPLATES) {
      const b = resolveBackdrop(t.backdrop);
      expect(b.ground, t.id).not.toBeNull();
      expect(b.fogDensity, t.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("uses Alice's numbers", () => {
    const moon = template('moon');
    expect(moon.sky.atmosphere).toEqual({ r: 0.11, g: 0.133, b: 0.178 });
    expect(moon.lighting.below).toEqual({ r: 0, g: 0.118, b: 0.396 });
    expect(template('amazon').lighting.above).toEqual({ r: 0.341, g: 0.576, b: 1 });
  });

  it("gives each ground's look on screen, for its texture to match (spec 17 section 2)", () => {
    expect(groundLook(backstageId('storystage/Ground/grass'))).toBe('#5f9e3a');
    expect(groundLook(backstageId('storystage/Ground/nowhere'))).toBeNull();
    for (const id of GROUND_TYPES) expect(groundLook(id), id).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('cubes the fog value, as Alice does, so small values stay subtle', () => {
    expect(fogDensity(0)).toBe(0);
    expect(fogDensity(1)).toBe(1);
    expect(fogDensity(0.5)).toBe(0.125);
    expect(template('seaFloor').fogDensity).toBeCloseTo(0.027, 6);
  });

  it('lets you see into water, ice and swamp', () => {
    expect(template('seaSurface').ground?.opacity).toBe(0.7);
    expect(template('northwestIsland').ground?.opacity).toBe(0.5);
    expect(template('seaSurfaceNight').ground?.opacity).toBe(0.5);
    expect(template('ice').ground?.opacity).toBe(0.7);
    expect(template('swamp').ground?.opacity).toBe(0.7);
    expect(template('grass').ground?.opacity).toBe(1);
  });

  it('gives the room walls and a ceiling', () => {
    expect(template('room').ground?.room).toBeDefined();
    expect(template('grass').ground?.room).toBeUndefined();
  });

  it('has a sky, white light from above and none from below when a scene sets nothing', () => {
    const empty = resolveBackdrop({});
    expect(empty.ground).toBeNull();
    expect(empty.sky.atmosphere).toEqual({ r: 0.5, g: 0.5, b: 1 });
    expect(empty.lighting).toEqual({ above: { r: 1, g: 1, b: 1 }, below: { r: 0, g: 0, b: 0 } });
    expect(empty.fogDensity).toBe(0);
  });

  it('refuses a ground, sky or lighting that is not built in', () => {
    const bad = backstageId('storystage/Ground/cheese');
    for (const backdrop of [{ ground: bad }, { sky: bad }, { lighting: bad }]) {
      let error: unknown;
      try {
        resolveBackdrop(backdrop);
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(StageError);
      expect((error as StageError).code).toBe('unknown_model');
    }
  });

  it('has the picture skies, each with a lighting of its name (spec 17 §2)', () => {
    expect(PICTURE_SKY_TYPES.map(String)).toEqual([
      'storystage/Sky/clearDay',
      'storystage/Sky/cloudy',
      'storystage/Sky/sunset',
      'storystage/Sky/night',
    ]);
    for (const sky of PICTURE_SKY_TYPES) {
      const lighting = backstageId(sky.replace('/Sky/', '/Lighting/'));
      const b = resolveBackdrop({ sky, lighting });
      expect(b.sky.picture, sky).toBe(true);
      expect(b.ids).toEqual({ ground: null, sky });
    }
    // Alice's template skies stay colours.
    for (const t of BACKDROP_TEMPLATES)
      expect(resolveBackdrop(t.backdrop).sky.picture).toBeUndefined();
  });

  it("lists every ground, with Alice's surfaces all there", () => {
    expect(GROUND_TYPES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(GROUND_TYPES).size).toBe(GROUND_TYPES.length);
  });
});
