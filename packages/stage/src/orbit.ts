/**
 * Look around's camera (07-ux section 7.2), pure: it orbits a point on the scene camera's line of
 * sight, as far ahead as what's in the shot is (so turning keeps it in view), or else where the
 * line of sight meets the ground, or a few metres ahead. Dragging turns it round that point and
 * tilts it; the wheel or a pinch brings it nearer or further; panning slides it, and the point,
 * without turning it (owner, 24 Nov).
 */
import type { Quat, Transform, Vec3 } from '@storystage/story-api';
import type { ViewStep } from './contract.ts';
import { groundPoint } from './editing.ts';
import { add, axisTurns, dot, mul, rotate, scale, sub, v } from './math.ts';

export interface Orbit {
  /** The point it looks at and turns round. */
  readonly target: Vec3;
  /** How far it is from the target, in metres. */
  readonly radius: number;
  /** Which way it looks, in radians about +Y: 0 looks along +Z. */
  readonly heading: number;
  /** How far it looks down, in radians: 0 is level. */
  readonly pitch: number;
  /** The camera's size, kept as it was. */
  readonly size: Vec3;
}

/** Nearest and furthest from the target, in metres. */
const NEAREST = 0.5;
const FURTHEST = 200;
/** Never quite straight up or down, where turning would be lost. */
const STEEPEST = Math.PI / 2 - 0.05;
/** How far ahead it looks when its line of sight meets no ground near enough. */
const AHEAD = 8;
const REACH = 40;

/** One press of an arrow key: a 24th of a turn. */
export const KEY_TURN = Math.PI / 12;
/** One press of + (or -): 1.25 times nearer (or further). */
export const KEY_NEARER = 1.25;
/** One press of Shift and an arrow: a sixth of the way to what it looks at, across or up. */
export const KEY_PAN = 1 / 6;

/**
 * The orbit that starts where a camera is, looking where it looks. `subjects` are the middles of
 * what's in its shot.
 */
export function orbitFrom(view: Transform, ground: number, subjects: readonly Vec3[] = []): Orbit {
  const forward = rotate(view.rotation, v(0, 0, 1));
  const heading = Math.atan2(forward.x, forward.z);
  const pitch = clamp(-Math.asin(clamp(forward.y, -1, 1)), -STEEPEST, STEEPEST);
  const ahead = subjects.map((p) => dot(sub(p, view.position), forward)).filter((d) => d > 0);
  const hit = groundPoint({ origin: view.position, direction: forward }, ground);
  const distance = ahead.length
    ? ahead.reduce((a, b) => a + b, 0) / ahead.length
    : hit
      ? Math.hypot(...sides(hit, view.position))
      : Infinity;
  const radius = distance <= REACH ? Math.max(distance, NEAREST) : AHEAD;
  return {
    target: add(view.position, scale(forward, radius)),
    radius,
    heading,
    pitch,
    size: view.scale,
  };
}

/** Which way the orbit's camera is turned. */
function turnOf(o: Orbit): Quat {
  return mul(
    axisTurns(v(0, 1, 0), o.heading / (2 * Math.PI)),
    axisTurns(v(1, 0, 0), o.pitch / (2 * Math.PI)),
  );
}

/** Where the orbit's camera is, and which way it looks. */
export function orbitView(o: Orbit): Transform {
  const rotation = turnOf(o);
  const forward = rotate(rotation, v(0, 0, 1));
  return { position: add(o.target, scale(forward, -o.radius)), rotation, scale: o.size };
}

/**
 * Slides the orbit without turning it: the camera and the point it turns round go `right` and
 * `up` along the camera's own right and up, in lengths of the radius, so a step moves the scene
 * the same share of the picture near and far. A camera looking along +Z has +X on its left.
 */
export function orbitPan(o: Orbit, right: number, up: number): Orbit {
  const turn = turnOf(o);
  const across = scale(rotate(turn, v(-1, 0, 0)), right * o.radius);
  const lift = scale(rotate(turn, v(0, 1, 0)), up * o.radius);
  return { ...o, target: add(o.target, add(across, lift)) };
}

/**
 * A pointer dragged `dx` by `dy` pixels to pan, on a view `height` pixels tall seen through
 * `fov` radians (top to bottom): what was under the pointer at the orbit's distance stays under
 * it, as if sliding the scene by hand.
 */
export function orbitPanDrag(o: Orbit, dx: number, dy: number, height: number, fov: number): Orbit {
  const perPixel = (2 * Math.tan(fov / 2)) / height;
  return orbitPan(o, -dx * perPixel, dy * perPixel);
}

/** One step of the orbit (`ViewStep`), the same size as its key. */
export function orbitStep(o: Orbit, step: ViewStep): Orbit {
  switch (step) {
    case 'circleLeft':
      return orbitBy(o, -KEY_TURN, 0);
    case 'circleRight':
      return orbitBy(o, KEY_TURN, 0);
    case 'riseAndLookDown':
      return orbitBy(o, 0, KEY_TURN);
    case 'dropAndLookUp':
      return orbitBy(o, 0, -KEY_TURN);
    case 'zoomIn':
      return orbitBy(o, 0, 0, KEY_NEARER);
    case 'zoomOut':
      return orbitBy(o, 0, 0, 1 / KEY_NEARER);
    case 'panLeft':
      return orbitPan(o, -KEY_PAN, 0);
    case 'panRight':
      return orbitPan(o, KEY_PAN, 0);
    case 'panUp':
      return orbitPan(o, 0, KEY_PAN);
    case 'panDown':
      return orbitPan(o, 0, -KEY_PAN);
  }
}

/**
 * Turns the orbit round its target by `across` radians (positive: the camera goes to its right)
 * and tilts it by `down` (positive: it rises and looks further down), and takes it `nearer` times
 * nearer.
 */
export function orbitBy(o: Orbit, across: number, down: number, nearer = 1): Orbit {
  return {
    ...o,
    heading: o.heading + across,
    pitch: clamp(o.pitch + down, -STEEPEST, STEEPEST),
    radius: clamp(o.radius / nearer, NEAREST, FURTHEST),
  };
}

/**
 * A pointer dragged `dx` by `dy` pixels on a view `width` by `height`, as if turning the scene by
 * hand: dragged right, the scene turns right, so the camera goes to its left. Half a turn a view
 * across; a quarter turn a view down.
 */
export function orbitDrag(o: Orbit, dx: number, dy: number, width: number, height: number): Orbit {
  return orbitBy(o, -(dx / width) * Math.PI, (dy / height) * (Math.PI / 2));
}

function clamp(n: number, least: number, most: number): number {
  return Math.min(Math.max(n, least), most);
}

function sides(a: Vec3, b: Vec3): [number, number, number] {
  return [a.x - b.x, a.y - b.y, a.z - b.z];
}
