import { IDENTITY, type Transform } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { axisTurns, dot, length, mul, rotate, sub, v } from './math.ts';
import {
  KEY_NEARER,
  KEY_PAN,
  KEY_TURN,
  orbitBy,
  orbitDrag,
  orbitFrom,
  orbitPan,
  orbitPanDrag,
  orbitStep,
  orbitView,
  stepCamera,
} from './orbit.ts';
import type { ViewStep } from './contract.ts';

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

  it('pans without turning, by a share of its distance (owner, 24 Nov)', () => {
    const o = orbitFrom(CAMERA, 0);
    const before = orbitView(o);
    const panned = orbitPan(o, 0.5, 0.25);
    const after = orbitView(panned);
    expect(panned.heading).toBe(o.heading);
    expect(panned.pitch).toBe(o.pitch);
    expect(panned.radius).toBe(o.radius);
    expect(after.rotation).toEqual(before.rotation);
    // The camera and the point it turns round move together.
    const moved = sub(after.position, before.position);
    expect(length(sub(sub(panned.target, o.target), moved))).toBeLessThan(1e-9);
    expect(length(moved)).toBeCloseTo(Math.hypot(0.5, 0.25) * o.radius, 9);
    // Looking along +Z, its right is -X; its up rises.
    expect(orbitView(orbitPan(o, 1, 0)).position.x).toBeCloseTo(-o.radius, 9);
    expect(orbitView(orbitPan(o, 0, 1)).position.y).toBeGreaterThan(before.position.y);
    // Twice as far away, a pan goes twice as far: the same share of the picture.
    const far = orbitBy(o, 0, 0, 0.5);
    expect(length(sub(orbitPan(far, 0.1, 0).target, far.target))).toBeCloseTo(
      2 * length(sub(orbitPan(o, 0.1, 0).target, o.target)),
      9,
    );
  });

  it('pans by a drag so what was under the pointer stays under it', () => {
    const o = orbitFrom(CAMERA, 0);
    const fov = 0.8;
    const dragged = orbitPanDrag(o, 100, 0, 360, fov);
    // Dragged right, the camera goes to its left, which is +X, as far as 100 pixels span there.
    const span = ((2 * Math.tan(fov / 2)) / 360) * 100 * o.radius;
    expect(dragged.target.x - o.target.x).toBeCloseTo(span, 9);
    // Dragged down, the scene goes down, so the camera rises.
    expect(orbitPanDrag(o, 0, 50, 360, fov).target.y).toBeGreaterThan(o.target.y);
  });

  it('steps as its keys do', () => {
    const o = orbitFrom(CAMERA, 0);
    const step = (s: ViewStep) => orbitStep(o, s);
    expect(step('circleLeft').heading).toBeCloseTo(o.heading - KEY_TURN, 9);
    expect(step('circleRight').heading).toBeCloseTo(o.heading + KEY_TURN, 9);
    expect(step('riseAndLookDown').pitch).toBeCloseTo(o.pitch + KEY_TURN, 9);
    expect(step('dropAndLookUp').pitch).toBeCloseTo(o.pitch - KEY_TURN, 9);
    expect(step('zoomIn').radius).toBeCloseTo(o.radius / KEY_NEARER, 9);
    expect(step('zoomOut').radius).toBeCloseTo(o.radius * KEY_NEARER, 9);
    expect(step('panLeft')).toEqual(orbitPan(o, -KEY_PAN, 0));
    expect(step('panRight')).toEqual(orbitPan(o, KEY_PAN, 0));
    expect(step('panUp')).toEqual(orbitPan(o, 0, KEY_PAN));
    expect(step('panDown')).toEqual(orbitPan(o, 0, -KEY_PAN));
  });

  it("steps a scene's camera: zoom and pan keep a tilted shot tilted (S5's review of #676)", () => {
    // Rolled a 16th of a turn, as a dutch angle.
    const dutch = { ...CAMERA, rotation: mul(CAMERA.rotation, axisTurns(v(0, 0, 1), 1 / 16)) };
    const o = orbitFrom(dutch, 0);
    for (const step of ['zoomIn', 'zoomOut', 'panLeft', 'panRight', 'panUp', 'panDown'] as const) {
      const after = stepCamera(dutch, 0, [], step);
      expect(after.rotation).toEqual(dutch.rotation);
      expect(after.position).not.toEqual(dutch.position);
    }
    // Zooming moves it along its line of sight by as much as Look around's step would.
    const nearer = stepCamera(dutch, 0, [], 'zoomIn');
    expect(length(sub(nearer.position, dutch.position))).toBeCloseTo(
      o.radius - o.radius / KEY_NEARER,
      9,
    );
    // Panning goes a sixth of the way to the point, along its own right.
    const right = stepCamera(dutch, 0, [], 'panRight');
    expect(length(sub(right.position, dutch.position))).toBeCloseTo(KEY_PAN * o.radius, 9);
    // Circling goes round the point, as Look around does, upright.
    const round = stepCamera(dutch, 0, [], 'circleLeft');
    expect(round).toEqual(orbitView(orbitStep(o, 'circleLeft')));
    expect(rotate(round.rotation, v(1, 0, 0)).y).toBeCloseTo(0, 9);
  });

  it('keeps the camera upright', () => {
    const view = orbitView(orbitBy(orbitFrom(CAMERA, 0), 0.7, 0.3));
    // Its own +X stays level.
    expect(rotate(view.rotation, v(1, 0, 0)).y).toBeCloseTo(0, 9);
    expect(mul(view.rotation, IDENTITY.rotation)).toEqual(view.rotation);
  });
});
