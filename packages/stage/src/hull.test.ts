import { IDENTITY, type Transform } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { hullOf, within, type Box } from './hull.ts';
import { axisTurns } from './math.ts';

const unit: Box = { min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } };
const at = (x: number, y = 0, z = 0): Transform => ({ ...IDENTITY, position: { x, y, z } });
const hull = (t: Transform, box = unit) => hullOf(box, t);

describe('hulls', () => {
  it('stand on the bottom of the box, with its height', () => {
    const h = hull(at(2, 3, 4));
    expect(h.base).toEqual({ x: 2, y: 3, z: 4 });
    expect(h.height).toBe(1);
    expect(h.outline).toHaveLength(4);
  });

  it('touch when they overlap, and not when there is a gap', () => {
    expect(within(hull(at(0)), hull(at(0.9)))).toBe(true);
    expect(within(hull(at(0)), hull(at(1.1)))).toBe(false);
  });

  it('do not touch if one is above the other', () => {
    expect(within(hull(at(0)), hull(at(0, 1.5)))).toBe(false);
    expect(within(hull(at(0)), hull(at(0, 0.5)))).toBe(true);
  });

  it('touch when their centres are in the same place', () => {
    expect(within(hull(at(1)), hull(at(1)))).toBe(true);
  });

  it('measure a gap between edges, not centres', () => {
    expect(within(hull(at(0)), hull(at(3)), 1.9)).toBe(false);
    expect(within(hull(at(0)), hull(at(3)), 2.1)).toBe(true);
  });

  it('turn with the object: a box corner reaches further than its face', () => {
    const turned: Transform = { ...at(0), rotation: axisTurns({ x: 0, y: 1, z: 0 }, 1 / 8) };
    expect(within(hull(turned), hull(at(1.1)))).toBe(true);
  });

  it('grow with the object', () => {
    const big: Transform = { ...at(0), scale: { x: 3, y: 1, z: 1 } };
    expect(within(hull(big), hull(at(1.9)))).toBe(true);
  });

  describe('of something flat, like a billboard', () => {
    const flat: Box = { min: { x: -0.5, y: 0, z: 0 }, max: { x: 0.5, y: 2, z: 0 } };

    it('reach along its width', () => {
      expect(within(hull(at(0), flat), hull(at(0.9), flat))).toBe(true);
      expect(within(hull(at(0), flat), hull(at(1.1), flat))).toBe(false);
    });

    it('reach along its width when it is turned', () => {
      const rotation = axisTurns({ x: 0, y: 1, z: 0 }, 1 / 8);
      const along = (d: number): Transform => ({
        ...IDENTITY,
        rotation,
        position: { x: d * Math.SQRT1_2, y: 0, z: -d * Math.SQRT1_2 },
      });
      expect(within(hull(along(0), flat), hull(along(0.9), flat))).toBe(true);
      expect(within(hull(along(0), flat), hull(along(1.1), flat))).toBe(false);
    });

    it('do not reach out of the sides', () => {
      const front: Transform = { ...IDENTITY, position: { x: 0, y: 0, z: 0.4 } };
      expect(within(hull(at(0), flat), hull(front, flat))).toBe(false);
    });
  });
});
