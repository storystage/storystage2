import { IDENTITY } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { FAR, boxPoints, groundPoint, inViewOf, rayHitsBox, viewRay } from './editing.ts';
import { axisTurns, v } from './math.ts';

/** Alice's lens: 0.5 radians tall, in turns. */
const LENS = 0.5 / (2 * Math.PI);
const camera = { position: v(0, 2, -6), rotation: IDENTITY.rotation };
const UNIT = { min: v(-0.5, 0, -0.5), max: v(0.5, 1, 0.5) };

describe('the scene view geometry', () => {
  it('looks along +Z through the middle of the view, with +X on the left', () => {
    const middle = viewRay(camera, LENS, 640, 360, 320, 180);
    expect(middle.direction.z).toBeCloseTo(1, 9);
    const left = viewRay(camera, LENS, 640, 360, 0, 180);
    expect(left.direction.x).toBeGreaterThan(0);
    // The top edge is half the lens above the middle.
    const top = viewRay(camera, LENS, 640, 360, 320, 0);
    expect(Math.atan2(top.direction.y, top.direction.z)).toBeCloseTo(0.25, 9);
  });

  it('turns the ray with the camera', () => {
    const turned = { ...camera, rotation: axisTurns(v(0, 1, 0), 0.25) };
    // A quarter turn about +Y takes +Z to +X.
    expect(viewRay(turned, LENS, 640, 360, 320, 180).direction.x).toBeCloseTo(1, 9);
  });

  it('meets the ground below the horizon, within reach, and never above it', () => {
    const down = viewRay(camera, LENS, 640, 360, 320, 359);
    expect(groundPoint(down, 0)!.y).toBeCloseTo(0, 9);
    expect(groundPoint(viewRay(camera, LENS, 640, 360, 320, 10), 0)).toBeNull();
    // Just below the horizon, the ground is further away than the camera can see.
    expect(groundPoint(viewRay(camera, LENS, 640, 360, 320, 181), 0)).toBeNull();
    expect(FAR).toBe(256);
  });

  it('hits a box at its near face, turned and sized as it is placed', () => {
    const ray = { origin: v(0, 0.5, -5), direction: v(0, 0, 1) };
    expect(rayHitsBox(ray, UNIT, IDENTITY)).toBeCloseTo(4.5, 9);
    const big = { ...IDENTITY, scale: v(2, 2, 2) };
    expect(rayHitsBox(ray, UNIT, big)).toBeCloseTo(4, 9);
    const aside = { ...IDENTITY, position: v(3, 0, 0) };
    expect(rayHitsBox(ray, UNIT, aside)).toBeNull();
    // Behind the ray's start: missed.
    expect(rayHitsBox({ ...ray, direction: v(0, 0, -1) }, UNIT, IDENTITY)).toBeNull();
  });

  it("knows what's in view, and what's behind or too far", () => {
    expect(inViewOf(camera, LENS, 16 / 9, v(0, 1, 0))).toBe(true);
    expect(inViewOf(camera, LENS, 16 / 9, v(0, 1, -10))).toBe(false);
    expect(inViewOf(camera, LENS, 16 / 9, v(0, 2, 300))).toBe(false);
    expect(inViewOf(camera, LENS, 16 / 9, v(10, 1, 0))).toBe(false);
  });

  it("gives a box's corners and middle where it's placed", () => {
    const points = boxPoints(UNIT, { ...IDENTITY, position: v(1, 0, 0) });
    expect(points).toHaveLength(9);
    expect(points[8]).toEqual(v(1, 0.5, 0));
  });
});
