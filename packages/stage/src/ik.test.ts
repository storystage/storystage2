import type { Vec3 } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { limitTurn, lookTurn, reachTurns, turnBetween } from './ik.ts';
import { add, axisTurns, length, rotate, sub, v } from './math.ts';

const close = (a: Vec3, b: Vec3, digits = 5) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
  expect(a.z).toBeCloseTo(b.z, digits);
};

/** Bends a limb by its turns, as the stage does to its joints. */
function bent(root: Vec3, middle: Vec3, end: Vec3, target: Vec3, pole: Vec3) {
  const turns = reachTurns({ root, middle, end }, target, pole);
  const newMiddle = add(root, rotate(turns.root, sub(middle, root)));
  const newEnd = add(newMiddle, rotate(turns.middle, rotate(turns.root, sub(end, middle))));
  return { middle: newMiddle, end: newEnd };
}

describe('turns', () => {
  it('take one direction to another the short way', () => {
    close(rotate(turnBetween(v(1, 0, 0), v(0, 1, 0)), v(1, 0, 0)), v(0, 1, 0));
    close(rotate(turnBetween(v(0, 0, 1), v(0, 0, -1)), v(0, 0, 1)), v(0, 0, -1));
    expect(turnBetween(v(1, 0, 0), v(2, 0, 0)).w).toBe(1);
  });

  it('stop at a limit', () => {
    const half = axisTurns(v(0, 1, 0), 0.25);
    const limited = limitTurn(half, 0.1);
    close(rotate(limited, v(0, 0, 1)), rotate(axisTurns(v(0, 1, 0), 0.1), v(0, 0, 1)));
    expect(limitTurn(half, 0.3)).toEqual(half);
  });
});

describe('reaching', () => {
  // An arm held straight out along +X: shoulder, elbow, hand, 0.3 m apart.
  const shoulder = v(0, 1.4, 0);
  const elbow = v(0.3, 1.4, 0);
  const hand = v(0.6, 1.4, 0);
  const behind = v(0.3, 1.4, -1);

  it('puts the hand on a point it can reach, keeping the bones their length', () => {
    const target = v(0.3, 1.2, 0.3);
    const arm = bent(shoulder, elbow, hand, target, behind);
    close(arm.end, target, 4);
    expect(length(sub(arm.middle, shoulder))).toBeCloseTo(0.3, 6);
    expect(length(sub(arm.end, arm.middle))).toBeCloseTo(0.3, 6);
  });

  it('bends the elbow towards the pole', () => {
    const arm = bent(shoulder, elbow, hand, v(0.4, 1.4, 0), behind);
    expect(arm.middle.z).toBeLessThan(-0.05);
  });

  it('points straight at a point out of reach', () => {
    const target = v(0, 1.4, 2);
    const arm = bent(shoulder, elbow, hand, target, behind);
    expect(arm.end.z).toBeCloseTo(0.6, 3);
    expect(Math.abs(arm.end.x)).toBeLessThan(1e-3);
  });

  it('gives the same pose every time', () => {
    const target = v(0.2, 1.6, 0.25);
    expect(reachTurns({ root: shoulder, middle: elbow, end: hand }, target, behind)).toEqual(
      reachTurns({ root: shoulder, middle: elbow, end: hand }, target, behind),
    );
  });
});

describe('looking', () => {
  it('turns to face a point within its limit, and no further', () => {
    const head = v(0, 1.6, 0);
    const near = lookTurn(head, v(0, 0, 1), v(1, 1.6, 1), 0.2);
    close(rotate(near, v(0, 0, 1)), v(Math.SQRT1_2, 0, Math.SQRT1_2));
    const behind = lookTurn(head, v(0, 0, 1), v(0, 1.6, -1), 0.2);
    const facing = rotate(behind, v(0, 0, 1));
    expect(Math.acos(facing.z) / (2 * Math.PI)).toBeCloseTo(0.2, 6);
  });
});
