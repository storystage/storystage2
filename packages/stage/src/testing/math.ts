/** Small vector and quaternion helpers for the fake stage. The real stage uses Babylon.js's. */
import type { Quat, Vec3 } from '@storystage/story-api';

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3) => v(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: Vec3, b: Vec3) => v(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: Vec3, k: number) => v(a.x * k, a.y * k, a.z * k);
export const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);

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

/** Heading in turns about +Y: 0 faces +Z, 0.25 faces +X. */
export function heading(q: Quat): number {
  const f = rotate(q, v(0, 0, 1));
  return Math.atan2(f.x, f.z) / (2 * Math.PI);
}
