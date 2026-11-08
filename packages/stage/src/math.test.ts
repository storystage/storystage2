import type { Quat, Vec3 } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { axisTurns, lookRotation, mul, rotate, toAxisTurns, v } from './math.ts';

const close = (a: Vec3, b: Vec3) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
  expect(a.z).toBeCloseTo(b.z, 6);
};
const same = (a: Quat, b: Quat) => {
  // q and -q are the same rotation.
  const k = Math.sign(a.w * b.w + a.x * b.x + a.y * b.y + a.z * b.z) || 1;
  for (const part of ['x', 'y', 'z', 'w'] as const) expect(a[part]).toBeCloseTo(b[part] * k, 6);
};

describe('rotations', () => {
  it('turn into an axis and turns, and back', () => {
    for (const q of [
      axisTurns(v(0, 1, 0), 0.25),
      axisTurns(v(1, 2, 3), -0.4),
      mul(axisTurns(v(1, 0, 0), 0.1), axisTurns(v(0, 0, 1), 0.3)),
    ]) {
      const { axis, turns } = toAxisTurns(q);
      expect(Math.abs(turns)).toBeLessThanOrEqual(0.5);
      same(axisTurns(axis, turns), q);
    }
    expect(toAxisTurns({ x: 0, y: 0, z: 0, w: 1 }).turns).toBe(0);
  });

  it('take the short way round', () => {
    expect(toAxisTurns(axisTurns(v(0, 1, 0), 0.75)).turns).toBeCloseTo(0.25, 6);
  });

  it('look along a direction with the top up', () => {
    for (const forward of [v(0, 0, 1), v(1, 0, 0), v(-1, 0, -1), v(0.3, -0.5, 0.2), v(0, 0, -1)]) {
      const q = lookRotation(forward, v(0, 1, 0))!;
      const length = Math.hypot(forward.x, forward.y, forward.z);
      close(rotate(q, v(0, 0, 1)), v(forward.x / length, forward.y / length, forward.z / length));
      expect(rotate(q, v(1, 0, 0)).y).toBeCloseTo(0, 6);
      expect(rotate(q, v(0, 1, 0)).y).toBeGreaterThan(0);
    }
  });

  it('give no rotation for no direction, or straight along up', () => {
    expect(lookRotation(v(0, 0, 0), v(0, 1, 0))).toBeNull();
    expect(lookRotation(v(0, 2, 0), v(0, 1, 0))).toBeNull();
  });
});
