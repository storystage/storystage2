/**
 * The scene view's handles (07-ux section 7.2), pure, so they can be tested without drawing:
 * where they are on a chosen object, which one a point of the view is on, and what dragging one
 * does to the object's set-up. The Babylon.js stage draws them and feeds them the pointer.
 *
 * - **Move:** drag the chosen object itself. It slides along the ground, level with where it was
 *   grabbed; with Shift, it goes up and down.
 * - **Turn:** a ring level with the bottom of its box, round its own vertical.
 * - **Resize:** a knob on top of its box; dragging it away from the object makes it bigger, evenly.
 *   A marker has no knob: it has a place and a turn, but no size.
 */
import type { Transform, Vec3 } from '@storystage/story-api';
import { FAR, boxPoints, toView, type Pose, type Ray } from './editing.ts';
import type { Box } from './hull.ts';
import { add, axisTurns, dot, mul, scale, sub, v } from './math.ts';

export type Handle = 'move' | 'turn' | 'resize';

/** How near the pointer must be, in CSS pixels, to take hold of the ring or the knob. */
export const RING_REACH = 12;
export const KNOB_REACH = 18;
/** The ring stands this much clear of the box, as a share of its size. */
const RING_CLEARANCE = 1.15;
/** How many straight pieces the ring is drawn with, and hit-tested against. */
export const RING_PIECES = 64;
/** Sizes a drag can't go past, so the set-up never refuses one. */
const SMALLEST = 0.01;
const LARGEST = 1000;

/** Where the handles are on a box placed by `t`. */
export interface HandlePlaces {
  /** The turn ring: level with the bottom of the box, round the object's own place. */
  readonly ring: { readonly centre: Vec3; readonly radius: number };
  /** The resize knob, on top of the box; null for a marker. */
  readonly knob: Vec3 | null;
  /** The bottom of the box, under its middle: what resizing is measured from. */
  readonly base: Vec3;
}

export function handlePlaces(box: Box, t: Transform, resizable: boolean): HandlePlaces {
  const points = boxPoints(box, t);
  const corners = points.slice(0, 8);
  const middle = points[8]!;
  const bottom = Math.min(...corners.map((p) => p.y));
  const top = Math.max(...corners.map((p) => p.y));
  const centre = v(t.position.x, bottom, t.position.z);
  const radius =
    Math.max(...corners.map((p) => Math.hypot(p.x - centre.x, p.z - centre.z)), 0.05) *
    RING_CLEARANCE;
  return {
    ring: { centre, radius },
    knob: resizable ? v(middle.x, top, middle.z) : null,
    base: v(middle.x, bottom, middle.z),
  };
}

/** The points the ring is drawn through, the first again at the end. */
export function ringPoints(ring: HandlePlaces['ring']): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i <= RING_PIECES; i++) {
    const a = ((i % RING_PIECES) / RING_PIECES) * 2 * Math.PI;
    out.push(add(ring.centre, v(Math.sin(a) * ring.radius, 0, Math.cos(a) * ring.radius)));
  }
  return out;
}

/** The view a handle is seen through: the camera's pose and lens, and the view's size. */
export interface Viewing {
  readonly pose: Pose;
  readonly lens: number;
  readonly width: number;
  readonly height: number;
}

const onView = (view: Viewing, p: Vec3) => toView(view.pose, view.lens, view.width, view.height, p);

/** The ring or the knob at a point of the view, the knob first; null for neither. */
export function handleAt(
  places: HandlePlaces,
  view: Viewing,
  x: number,
  y: number,
): 'turn' | 'resize' | null {
  if (places.knob) {
    const k = onView(view, places.knob);
    if (k && Math.hypot(k.x - x, k.y - y) <= KNOB_REACH) return 'resize';
  }
  const ring = ringPoints(places.ring).map((p) => onView(view, p));
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i];
    if (a && b && toSegment(x, y, a, b) <= RING_REACH) return 'turn';
  }
  return null;
}

/** How far a point is from a line segment, in the view's pixels. */
function toSegment(
  x: number,
  y: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const along = dx * dx + dy * dy;
  const t = along === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / along));
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

/** Where a ray meets the level plane at `height`, within reach; null if it doesn't. */
function onLevel(ray: Ray, height: number): Vec3 | null {
  if (Math.abs(ray.direction.y) < 1e-9) return null;
  const distance = (height - ray.origin.y) / ray.direction.y;
  if (!(distance > 0) || distance > FAR) return null;
  return add(ray.origin, scale(ray.direction, distance));
}

/**
 * Moves along the ground, level with `grab`, where the object was taken hold of: by how far the
 * pointer's line of sight has gone on that level, from `from` to `to`.
 */
export function moveAlongGround(
  start: Transform,
  grab: Vec3,
  from: Ray,
  to: Ray,
): Transform | null {
  const a = onLevel(from, grab.y);
  const b = onLevel(to, grab.y);
  if (!a || !b) return null;
  return {
    ...start,
    position: v(start.position.x + b.x - a.x, start.position.y, start.position.z + b.z - a.z),
  };
}

/**
 * Moves up and down (with Shift): by how far the pointer's line of sight has gone on a standing
 * plane through `grab`, facing the way `from` looks.
 */
export function moveUpDown(start: Transform, grab: Vec3, from: Ray, to: Ray): Transform | null {
  const n = v(from.direction.x, 0, from.direction.z);
  if (Math.hypot(n.x, n.z) < 1e-6) return null;
  const a = onStanding(from, grab, n);
  const b = onStanding(to, grab, n);
  if (!a || !b) return null;
  return { ...start, position: { ...start.position, y: start.position.y + b.y - a.y } };
}

function onStanding(ray: Ray, through: Vec3, n: Vec3): Vec3 | null {
  const across = dot(ray.direction, n);
  if (Math.abs(across) < 1e-9) return null;
  const distance = dot(sub(through, ray.origin), n) / across;
  if (!(distance > 0) || distance > FAR) return null;
  return add(ray.origin, scale(ray.direction, distance));
}

/** Turns about the vertical, by how far round the ring the pointer has gone from `from` to `to`. */
export function turnAbout(
  start: Transform,
  ring: HandlePlaces['ring'],
  from: Ray,
  to: Ray,
): Transform | null {
  const a = onLevel(from, ring.centre.y);
  const b = onLevel(to, ring.centre.y);
  if (!a || !b) return null;
  const angle = (p: Vec3) => Math.atan2(p.x - ring.centre.x, p.z - ring.centre.z);
  const by = angle(b) - angle(a);
  return { ...start, rotation: mul(axisTurns(v(0, 1, 0), by / (2 * Math.PI)), start.rotation) };
}

/**
 * Resizes evenly: the knob, dragged from (`x0`, `y0`) to (`x`, `y`) on the view, grows the object
 * by how far it has gone along the line from its base to the knob, as on the view.
 */
export function resizeEvenly(
  start: Transform,
  places: HandlePlaces,
  view: Viewing,
  x0: number,
  y0: number,
  x: number,
  y: number,
): Transform | null {
  if (!places.knob) return null;
  const k = onView(view, places.knob);
  const b = onView(view, places.base);
  if (!k || !b) return null;
  const tall = Math.max(Math.hypot(k.x - b.x, k.y - b.y), 10);
  const along = ((x - x0) * (k.x - b.x) + (y - y0) * (k.y - b.y)) / tall;
  let factor = Math.max((tall + along) / tall, 0.05);
  const s = start.scale;
  const least = Math.min(s.x, s.y, s.z);
  const most = Math.max(s.x, s.y, s.z);
  factor = Math.min(Math.max(factor, SMALLEST / least), LARGEST / most);
  return { ...start, scale: v(s.x * factor, s.y * factor, s.z * factor) };
}
