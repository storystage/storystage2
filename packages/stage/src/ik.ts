/**
 * WP5.8: bending a limb to reach a point, and turning a head to look at one. Plain arithmetic on
 * joints in the scene's axes, so it gives the same pose every time, on every renderer.
 *
 * Babylon.js has controllers for both, but they move a bone, and a glTF model's bones follow
 * their nodes (`models.ts`), so the stage moves the nodes itself.
 */
import type { Quat, Vec3 } from '@storystage/story-api';
import {
  add,
  axisTurns,
  conjugate,
  cross,
  dot,
  length,
  mul,
  rotate,
  scale,
  sub,
  unit,
  v,
} from './math.ts';

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** The shortest turn that takes direction `from` to direction `to`. */
export function turnBetween(from: Vec3, to: Vec3): Quat {
  const a = unit(from);
  const b = unit(to);
  if (!a || !b) return IDENTITY;
  const d = Math.max(-1, Math.min(1, dot(a, b)));
  if (d > 1 - 1e-9) return IDENTITY;
  if (d < -1 + 1e-9) {
    // Half a turn, about any axis square to `a`.
    const axis = unit(cross(a, v(1, 0, 0))) ?? unit(cross(a, v(0, 1, 0)))!;
    return axisTurns(axis, 0.5);
  }
  return axisTurns(cross(a, b), Math.acos(d) / (2 * Math.PI));
}

/** The same turn, but no more than `limit` turns of it. */
export function limitTurn(q: Quat, limit: number): Quat {
  const w = Math.min(1, Math.abs(q.w));
  const turns = Math.acos(w) / Math.PI;
  if (turns <= limit) return q;
  const s = Math.sqrt(1 - w * w);
  const k = q.w < 0 ? -1 : 1;
  return axisTurns(v((q.x * k) / s, (q.y * k) / s, (q.z * k) / s), limit);
}

export interface Limb {
  /** Where the three joints are: the root (a shoulder), the middle (an elbow), the end (a hand). */
  readonly root: Vec3;
  readonly middle: Vec3;
  readonly end: Vec3;
}

/**
 * The turns, in the scene's axes, that bend a limb so its end reaches `target`, or points
 * straight at it if it's out of reach. The middle joint bends towards `pole` (an elbow's
 * outside, a knee's front), or the way it bends now if `pole` is in line.
 */
export function reachTurns(limb: Limb, target: Vec3, pole: Vec3): { root: Quat; middle: Quat } {
  const { root, middle, end } = limb;
  const upper = length(sub(middle, root));
  const lower = length(sub(end, middle));
  const toTarget = sub(target, root);
  const way = unit(toTarget);
  if (!way || upper === 0 || lower === 0) return { root: IDENTITY, middle: IDENTITY };
  // Stop a hair short of straight, and of folded flat, so the bend always has a side.
  const reach = Math.min(
    Math.max(length(toTarget), Math.abs(upper - lower) + 1e-4),
    upper + lower - 1e-4,
  );
  const square = (from: Vec3) => {
    const off = sub(from, scale(way, dot(from, way)));
    return unit(off);
  };
  const bend =
    square(sub(pole, root)) ??
    square(sub(middle, root)) ??
    unit(cross(way, v(0, 1, 0))) ??
    v(1, 0, 0);
  const cosine = (upper * upper + reach * reach - lower * lower) / (2 * upper * reach);
  const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  const newMiddle = add(root, add(scale(way, upper * cosine), scale(bend, upper * sine)));
  const newEnd = add(root, scale(way, reach));
  const rootTurn = turnBetween(sub(middle, root), sub(newMiddle, root));
  const lowerNow = rotate(rootTurn, sub(end, middle));
  return { root: rootTurn, middle: turnBetween(lowerNow, sub(newEnd, newMiddle)) };
}

/** The turn, in the scene's axes, that points `facing` at `target` from `from`, up to `limit` turns. */
export function lookTurn(from: Vec3, facing: Vec3, target: Vec3, limit: number): Quat {
  return limitTurn(turnBetween(facing, sub(target, from)), limit);
}

/** A turn applied on top of a joint's turn in the scene, as the joint's own turn under its parent. */
export function localAfter(turn: Quat, world: Quat, parentWorld: Quat): Quat {
  return mul(conjugate(parentWorld), mul(turn, world));
}
