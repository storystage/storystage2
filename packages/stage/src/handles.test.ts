import { IDENTITY, type Transform } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { MARKER_BOX, toView, viewRay } from './editing.ts';
import {
  handleAt,
  handlePlaces,
  moveAlongGround,
  moveUpDown,
  resizeEvenly,
  ringPoints,
  turnAbout,
  type Viewing,
} from './handles.ts';
import { heading, v } from './math.ts';

/** Alice's lens, and a camera 6 m back and 2 m up looking along +Z, on a 640 by 360 view. */
const LENS = 0.5 / (2 * Math.PI);
const VIEW: Viewing = {
  pose: { position: v(0, 2, -6), rotation: IDENTITY.rotation },
  lens: LENS,
  width: 640,
  height: 360,
};
const UNIT = { min: v(-0.5, 0, -0.5), max: v(0.5, 1, 0.5) };
const at = (x: number, y: number, z: number): Transform => ({ ...IDENTITY, position: v(x, y, z) });
const ray = (x: number, y: number) => viewRay(VIEW.pose, LENS, 640, 360, x, y);
const onView = (p: { x: number; y: number; z: number }) => toView(VIEW.pose, LENS, 640, 360, p)!;

describe('the scene view handles', () => {
  it('puts the ring round the bottom of the box, and the knob on top', () => {
    const places = handlePlaces(UNIT, at(1, 0, 2), true);
    expect(places.ring.centre).toEqual(v(1, 0, 2));
    // Clear of the box's corners, which are 0.71 m out.
    expect(places.ring.radius).toBeGreaterThan(Math.SQRT1_2);
    expect(places.knob).toEqual(v(1, 1, 2));
    expect(places.base).toEqual(v(1, 0, 2));
    expect(handlePlaces(MARKER_BOX, at(0, 1, 0), false).knob).toBeNull();
    const ring = ringPoints(places.ring);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('projects back to where the ray came from', () => {
    for (const [x, y] of [
      [320, 180],
      [10, 300],
      [600, 40],
    ] as const) {
      const r = ray(x, y);
      const p = toView(VIEW.pose, LENS, 640, 360, {
        x: r.origin.x + r.direction.x * 5,
        y: r.origin.y + r.direction.y * 5,
        z: r.origin.z + r.direction.z * 5,
      })!;
      expect(p.x).toBeCloseTo(x, 6);
      expect(p.y).toBeCloseTo(y, 6);
    }
    expect(toView(VIEW.pose, LENS, 640, 360, v(0, 2, -10))).toBeNull();
  });

  it('finds the knob first, then the ring, and neither elsewhere', () => {
    const places = handlePlaces(UNIT, at(0, 0, 0), true);
    const knob = onView(places.knob!);
    expect(handleAt(places, VIEW, knob.x + 5, knob.y)).toBe('resize');
    const front = onView(v(0, 0, -places.ring.radius));
    expect(handleAt(places, VIEW, front.x, front.y + 3)).toBe('turn');
    expect(handleAt(places, VIEW, 20, 20)).toBeNull();
  });

  it('moves along the ground with the pointer, keeping the height', () => {
    const start = at(0, 0.5, 0);
    const from = ray(320, 250);
    const to = ray(200, 250);
    const grab = { x: 0, y: 0.5, z: 0 };
    const moved = moveAlongGround(start, grab, from, to)!;
    expect(moved.position.y).toBe(0.5);
    // Screen-left is +X.
    expect(moved.position.x).toBeGreaterThan(0.5);
    // Back where it began, it's where it began.
    expect(moveAlongGround(start, grab, from, from)!.position).toEqual(start.position);
  });

  it('moves up and down with Shift, and nowhere else', () => {
    const start = at(0, 0, 0);
    const grab = v(0, 0.5, 0);
    const lifted = moveUpDown(start, grab, ray(320, 250), ray(320, 200))!;
    expect(lifted.position.y).toBeGreaterThan(0.3);
    expect(lifted.position.x).toBe(0);
    expect(lifted.position.z).toBe(0);
  });

  it('turns about the vertical as the pointer goes round the ring', () => {
    const start = at(0, 0, 0);
    const places = handlePlaces(UNIT, start, true);
    const front = onView(v(0, 0, -places.ring.radius));
    const side = onView(v(places.ring.radius, 0, 0));
    const turned = turnAbout(start, places.ring, ray(front.x, front.y), ray(side.x, side.y))!;
    // From -Z round to +X is a quarter turn back the other way: -0.25 turns, the short way.
    expect(heading(turned.rotation)).toBeCloseTo(-0.25, 6);
    expect(turned.position).toEqual(start.position);
  });

  it('resizes evenly, by how far the knob goes from the base', () => {
    const start = at(0, 0, 0);
    const places = handlePlaces(UNIT, start, true);
    const knob = onView(places.knob!);
    const base = onView(places.base);
    const tall = base.y - knob.y;
    const bigger = resizeEvenly(start, places, VIEW, knob.x, knob.y, knob.x, knob.y - tall)!;
    expect(bigger.scale.x).toBeCloseTo(2, 6);
    expect(bigger.scale.y).toBeCloseTo(2, 6);
    const smallest = resizeEvenly(start, places, VIEW, knob.x, knob.y, knob.x, knob.y + 10 * tall)!;
    expect(smallest.scale.x).toBeGreaterThan(0);
  });
});
