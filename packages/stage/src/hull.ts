/**
 * When two things touch, or are close, by Alice's rule: each has a footprint and a height, taken
 * from its box as it stands in the scene. They touch if their heights overlap and their centres
 * are closer than the two footprints reach towards each other. Proximity is the same test with
 * a margin, so it measures the gap between two things, not between their centres.
 */
import type { Transform, Vec3 } from '@storystage/story-api';
import { add, rotate, v } from './math.ts';

/** A model's box at scale 1, around its own origin. */
export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

interface Point {
  readonly x: number;
  readonly z: number;
}

export interface Hull {
  /** The middle of the bottom of the object's box in the scene. */
  readonly base: Vec3;
  readonly height: number;
  /** The footprint: a convex outline around `base`, anticlockwise. */
  readonly outline: readonly Point[];
}

const cross = (o: Point, a: Point, b: Point) =>
  (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

/** The convex outline of some points (Andrew's monotone chain). */
function outlineOf(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  const half = (list: readonly Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0)
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

export function hullOf(box: Box, t: Transform): Hull {
  const corners: Vec3[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const scaled = v(x * t.scale.x, y * t.scale.y, z * t.scale.z);
        corners.push(add(t.position, rotate(t.rotation, scaled)));
      }
  const across = (axis: 'x' | 'y' | 'z') => {
    const values = corners.map((c) => c[axis]);
    return { low: Math.min(...values), high: Math.max(...values) };
  };
  const x = across('x');
  const y = across('y');
  const z = across('z');
  const base = v((x.low + x.high) / 2, y.low, (z.low + z.high) / 2);
  return {
    base,
    height: y.high - y.low,
    outline: outlineOf(corners.map((c) => ({ x: c.x - base.x, z: c.z - base.z }))),
  };
}

const TINY = 1e-9;

/** How far a footprint reaches from its centre along a direction. */
function reach(hull: Hull, x: number, z: number): number {
  const size = Math.hypot(x, z);
  const { outline } = hull;
  if (size === 0) return Math.max(0, ...outline.map((p) => Math.hypot(p.x, p.z)));
  const d = { x: x / size, z: z / size };
  let far = 0;
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    const edge = { x: b.x - a.x, z: b.z - a.z };
    const facing = d.x * edge.z - d.z * edge.x;
    const beside = a.x * d.z - a.z * d.x;
    if (Math.abs(facing) < TINY) {
      // A flat thing's footprint is a line, and the direction can run along it.
      if (Math.abs(beside) < TINY)
        far = Math.max(far, a.x * d.x + a.z * d.z, b.x * d.x + b.z * d.z);
      return;
    }
    const along = (a.x * edge.z - a.z * edge.x) / facing;
    const on = beside / facing;
    if (along > 0 && on >= 0 && on <= 1) far = Math.max(far, along);
  });
  return far;
}

/** Whether two hulls touch, or come within `gap` metres of each other. */
export function within(a: Hull, b: Hull, gap = 0): boolean {
  const aTop = a.base.y + a.height;
  const bTop = b.base.y + b.height;
  if (bTop + gap <= a.base.y || b.base.y - gap >= aTop) return false;
  const x = b.base.x - a.base.x;
  const z = b.base.z - a.base.z;
  const allowed = reach(a, x, z) + reach(b, -x, -z) + gap;
  return x * x + z * z < allowed * allowed;
}
