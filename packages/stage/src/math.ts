/** Small vector and quaternion helpers for the timeline, which has no graphics library. */
import type { Quat, Vec3 } from '@storystage/story-api';

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3) => v(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3) => v(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number) => v(a.x * k, a.y * k, a.z * k);
export const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3) =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
/** Multiplies each part: a size by a scale. */
export const times = (a: Vec3, b: Vec3) => v(a.x * b.x, a.y * b.y, a.z * b.z);
/** A unit vector the same way as `a`, or null if `a` is too short to have a way. */
export function unit(a: Vec3): Vec3 | null {
  const len = length(a);
  return len < 1e-9 ? null : scale(a, 1 / len);
}

export const IDENTITY_Q: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** A rotation of `turns` (1 = 360°) about `axis` (normalised here). */
export function axisTurns(axis: Vec3, turns: number): Quat {
  const len = length(axis) || 1;
  const half = turns * Math.PI;
  const s = Math.sin(half) / len;
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(half) };
}

/** The rotation `a * b`: apply `b`, then `a`. */
export function mul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

/** The opposite rotation of a unit quaternion. */
export const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

/** Rotates a vector by a unit quaternion. */
export function rotate(q: Quat, p: Vec3): Vec3 {
  const ix = q.w * p.x + q.y * p.z - q.z * p.y;
  const iy = q.w * p.y + q.z * p.x - q.x * p.z;
  const iz = q.w * p.z + q.x * p.y - q.y * p.x;
  const iw = -q.x * p.x - q.y * p.y - q.z * p.z;
  return v(
    ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  );
}

/**
 * The rotation `q` as an axis and an amount in turns, the short way round, so that
 * `axisTurns(axis, turns)` gives `q` back.
 */
export function toAxisTurns(q: Quat): { axis: Vec3; turns: number } {
  const k = q.w < 0 ? -1 : 1;
  const w = Math.min(1, q.w * k);
  const s = Math.sqrt(1 - w * w);
  if (s < 1e-9) return { axis: v(0, 1, 0), turns: 0 };
  return { axis: v((q.x * k) / s, (q.y * k) / s, (q.z * k) / s), turns: Math.acos(w) / Math.PI };
}

/**
 * The rotation that makes something's +Z point along `forward` and its +Y as near `up` as it
 * can. Null if `forward` has no length or runs along `up`.
 */
export function lookRotation(forward: Vec3, up: Vec3): Quat | null {
  const z = unit(forward);
  if (!z) return null;
  const x = unit(cross(up, z));
  if (!x) return null;
  const y = cross(z, x);
  // From the rotation matrix whose columns are x, y and z.
  const trace = x.x + y.y + z.z;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return { w: 0.25 / s, x: (y.z - z.y) * s, y: (z.x - x.z) * s, z: (x.y - y.x) * s };
  }
  if (x.x > y.y && x.x > z.z) {
    const s = 2 * Math.sqrt(1 + x.x - y.y - z.z);
    return { w: (y.z - z.y) / s, x: 0.25 * s, y: (y.x + x.y) / s, z: (z.x + x.z) / s };
  }
  if (y.y > z.z) {
    const s = 2 * Math.sqrt(1 + y.y - x.x - z.z);
    return { w: (z.x - x.z) / s, x: (y.x + x.y) / s, y: 0.25 * s, z: (z.y + y.z) / s };
  }
  const s = 2 * Math.sqrt(1 + z.z - x.x - y.y);
  return { w: (x.y - y.x) / s, x: (z.x + x.z) / s, y: (z.y + y.z) / s, z: 0.25 * s };
}

/** Heading in turns about +Y: 0 faces +Z, 0.25 faces +X. */
export function heading(q: Quat): number {
  const f = rotate(q, v(0, 0, 1));
  return Math.atan2(f.x, f.z) / (2 * Math.PI);
}
