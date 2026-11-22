import { IDENTITY, type Transform } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { axisTurns, dot, length, mul, rotate, sub, v } from './math.ts';
import { orbitBy, orbitDrag, orbitFrom, orbitView } from './orbit.ts';

/** 6 m back and 2 m up, looking along +Z and a little down. */
const CAMERA: Transform = {
  ...IDENTITY,
  position: v(0, 2, -6),
  rotation: axisTurns(v(1, 0, 0), 0.03),
};

describe("Look around's camera", () => {
  it('starts exactly where the camera is, looking where it looks', () => {
    const o = orbitFrom(CAMERA, 0);
    const view = orbitView(o);
    expect(length(sub(view.position, CAMERA.position))).toBeLessThan(1e-9);
    const f = rotate(view.rotation, v(0, 0, 1));
    const g = rotate(CAMERA.rotation, v(0, 0, 1));
    expect(length(sub(f, g))).toBeLessThan(1e-9);
    // It turns round where the line of sight meets the ground.
    expect(o.target.y).toBeCloseTo(0, 9);
  });

  it("turns round a point as far ahead as what's in the shot", () => {
    // The line of sight meets the ground 20 m away, beyond everything.
    const o = orbitFrom(CAMERA, 0, [v(1, 0.5, 0), v(-1, 0.5, 2)]);
    const f = rotate(CAMERA.rotation, v(0, 0, 1));
    expect(o.radius).toBeCloseTo(
      (dot(sub(v(1, 0.5, 0), CAMERA.position), f) + dot(sub(v(-1, 0.5, 2), CAMERA.position), f)) /
        2,
      9,
    );
    expect(length(sub(orbitView(o).position, CAMERA.position))).toBeLessThan(1e-9);
  });

  it('turns round a point a few metres ahead when it looks at no ground', () => {
    const level = orbitFrom(IDENTITY, 0);
    expect(level.radius).toBe(8);
    expect(level.target).toEqual(v(0, 0, 8));
  });

  it('keeps its distance as it turns, and tilts no further than straight down', () => {
    const o = orbitFrom(CAMERA, 0);
    const turned = orbitView(orbitBy(o, 1, 0));
    expect(length(sub(turned.position, o.target))).toBeCloseTo(o.radius, 9);
    const over = orbitBy(o, 0, 10);
    expect(over.pitch).toBeLessThan(Math.PI / 2);
  });

  it('turns the scene the way it is dragged', () => {
    const o = orbitFrom(CAMERA, 0);
    // Dragged right, the camera goes to its left, which is +X.
    expect(orbitView(orbitDrag(o, 100, 0, 640, 360)).position.x).toBeGreaterThan(0);
    // Dragged down, it rises.
    expect(orbitView(orbitDrag(o, 0, 50, 640, 360)).position.y).toBeGreaterThan(2);
  });

  it('comes nearer, within limits', () => {
    const o = orbitFrom(CAMERA, 0);
    expect(orbitBy(o, 0, 0, 2).radius).toBeCloseTo(o.radius / 2, 9);
    expect(orbitBy(o, 0, 0, 1000).radius).toBe(0.5);
    expect(orbitBy(o, 0, 0, 0.0001).radius).toBe(200);
  });

  it('keeps the camera upright', () => {
    const view = orbitView(orbitBy(orbitFrom(CAMERA, 0), 0.7, 0.3));
    // Its own +X stays level.
    expect(rotate(view.rotation, v(1, 0, 0)).y).toBeCloseTo(0, 9);
    expect(mul(view.rotation, IDENTITY.rotation)).toEqual(view.rotation);
  });
});
