/**
 * The scene view's geometry (07-ux section 7.2), pure, so both stages agree on it: the ray
 * through a point of the view, where it meets the ground, what it hits, and whether a point is in
 * the camera's view. A camera with no rotation looks along +Z with +Y up, so +X is on the
 * picture's left (the contract's directions).
 */
import type { Quat, Transform, Vec3 } from '@storystage/story-api';
import type { Box } from './hull.ts';
import { add, conjugate, rotate, scale, sub, v } from './math.ts';

/** Where the camera can see from and to, in metres: the stage's clipping distances. */
export const NEAR = 0.125;
export const FAR = 256;

export interface Ray {
  readonly origin: Vec3;
  /** A unit vector. */
  readonly direction: Vec3;
}

interface Pose {
  readonly position: Vec3;
  readonly rotation: Quat;
}

/**
 * The ray through the point (`x`, `y`) of a view `width` by `height` (pixels from its top left),
 * from a camera at `pose` whose vertical viewing angle is `lens` turns.
 */
export function viewRay(
  pose: Pose,
  lens: number,
  width: number,
  height: number,
  x: number,
  y: number,
): Ray {
  const up = Math.tan(lens * Math.PI);
  const across = up * (width / height);
  const right = (x / width) * 2 - 1;
  const raised = 1 - (y / height) * 2;
  // Screen-right is the camera's -X.
  const local = v(-right * across, raised * up, 1);
  const direction = rotate(pose.rotation, local);
  return {
    origin: pose.position,
    direction: scale(direction, 1 / Math.hypot(local.x, local.y, 1)),
  };
}

/** Where a ray meets the ground at height `ground`, within the camera's reach; null if it doesn't. */
export function groundPoint(ray: Ray, ground: number): Vec3 | null {
  if (ray.direction.y >= 0) return null;
  const distance = (ground - ray.origin.y) / ray.direction.y;
  if (!(distance > 0) || distance > FAR) return null;
  return add(ray.origin, scale(ray.direction, distance));
}

/** How far along a ray it first meets a box placed by `t` (scaled, turned, moved); null if never. */
export function rayHitsBox(ray: Ray, box: Box, t: Transform): number | null {
  // Into the box's own axes, where it's a plain box.
  const back = conjugate(t.rotation);
  const s = t.scale;
  const local = (p: Vec3) => {
    const r = rotate(back, p);
    return v(r.x / s.x, r.y / s.y, r.z / s.z);
  };
  const origin = local(sub(ray.origin, t.position));
  const direction = local(ray.direction);
  let near = -Infinity;
  let far = Infinity;
  for (const k of ['x', 'y', 'z'] as const) {
    const d = direction[k];
    const o = origin[k];
    if (Math.abs(d) < 1e-12) {
      if (o < box.min[k] || o > box.max[k]) return null;
      continue;
    }
    const a = (box.min[k] - o) / d;
    const b = (box.max[k] - o) / d;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
  }
  if (near > far || far < 0) return null;
  // The same step along the ray in both axes, and the ray's direction is a unit vector.
  return Math.max(near, 0);
}

/** Whether a point is in the view of a camera at `pose`, `lens` turns tall, at `aspect`. */
export function inViewOf(pose: Pose, lens: number, aspect: number, point: Vec3): boolean {
  const p = rotate(conjugate(pose.rotation), sub(point, pose.position));
  if (p.z < NEAR || p.z > FAR) return false;
  const up = Math.tan(lens * Math.PI);
  return Math.abs(p.y) <= p.z * up && Math.abs(p.x) <= p.z * up * aspect;
}

/** The corners and middle of a box placed by `t`: what `inShot` looks for. */
export function boxPoints(box: Box, t: Transform): Vec3[] {
  const place = (p: Vec3) =>
    add(t.position, rotate(t.rotation, v(p.x * t.scale.x, p.y * t.scale.y, p.z * t.scale.z)));
  const out: Vec3[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) out.push(place(v(x, y, z)));
  out.push(place(scale(add(box.min, box.max), 0.5)));
  return out;
}
