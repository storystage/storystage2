/**
 * WP4.6: humanoid poses that play on any humanoid ("retargeting", as Unity's Mecanim Humanoid
 * does). A pose is written once against the VRM 1.0 humanoid bones, and each bone's turn is
 * measured from a T-pose, in the axes of a model facing +Z with +X on its left. A model's own
 * rest pose and its bones' own axes don't matter: the stage works out each model's from where
 * its bones rest (`babylon/humanoid-rig.ts`).
 *
 * No graphics here, so both stages agree on a pose, and a film is posed the same every time.
 */
import { JOINT_MAP } from '@storystage/backstage';
import type { JointName, Quat, Vec3 } from '@storystage/story-api';
import { conjugate, IDENTITY_Q, mul, v } from '../math.ts';

/** The VRM humanoid bones and what each hangs from, parents first. */
export const HUMAN_BONES: readonly {
  readonly joint: JointName;
  readonly parent: JointName | null;
}[] = JOINT_MAP.biped.filter((d) => d.vrm).map((d) => ({ joint: d.id, parent: d.parent }));

export interface HumanPose {
  /** Each bone's turn under its parent, from a T-pose. A bone that isn't here doesn't turn. */
  readonly turns: ReadonlyMap<JointName, Quat>;
  /** How far the hips are from where they rest, in hips' heights, in the model's axes. */
  readonly hips: Vec3;
}

export const T_POSE: HumanPose = { turns: new Map(), hips: v(0, 0, 0) };

/** A clip of humanoid poses. Between keys, each turn goes the short way, at an even speed. */
export interface HumanClip {
  readonly name: string;
  /** Seconds. */
  readonly duration: number;
  /** Keys in time order: the first at 0 and the last at `duration`. */
  readonly keys: readonly { readonly time: number; readonly pose: HumanPose }[];
  /** A walk or a run starts again at its end. */
  readonly loop: boolean;
  /** For a walk or a run: how fast its feet carry it, in hips' heights a second. */
  readonly speed?: number;
}

const dotQ = (a: Quat, b: Quat) => a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;

/** The turn `t` of the way from `a` to `b`, the short way round. */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let d = dotQ(a, b);
  const k = d < 0 ? -1 : 1;
  d *= k;
  let wa: number;
  let wb: number;
  if (d > 0.9995) {
    wa = 1 - t;
    wb = t;
  } else {
    const angle = Math.acos(d);
    const s = Math.sin(angle);
    wa = Math.sin((1 - t) * angle) / s;
    wb = Math.sin(t * angle) / s;
  }
  const q = {
    x: wa * a.x + wb * k * b.x,
    y: wa * a.y + wb * k * b.y,
    z: wa * a.z + wb * k * b.z,
    w: wa * a.w + wb * k * b.w,
  };
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

const lerpV = (a: Vec3, b: Vec3, t: number) =>
  v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);

/** Part way between two poses. */
export function between(a: HumanPose, b: HumanPose, t: number): HumanPose {
  const turns = new Map<JointName, Quat>();
  for (const joint of new Set([...a.turns.keys(), ...b.turns.keys()]))
    turns.set(joint, slerp(a.turns.get(joint) ?? IDENTITY_Q, b.turns.get(joint) ?? IDENTITY_Q, t));
  return { turns, hips: lerpV(a.hips, b.hips, t) };
}

/** A clip's pose `time` seconds in. A clip that doesn't loop holds its first and last poses. */
export function sample(clip: HumanClip, time: number, loop = clip.loop): HumanPose {
  const { keys, duration } = clip;
  if (keys.length === 1 || duration <= 0) return keys[0]!.pose;
  const t = loop
    ? ((time % duration) + duration) % duration
    : Math.min(Math.max(time, 0), duration);
  // The last key at or before `t`.
  let low = 0;
  let high = keys.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (keys[middle]!.time <= t) low = middle;
    else high = middle - 1;
  }
  const a = keys[low]!;
  const b = keys[Math.min(low + 1, keys.length - 1)]!;
  const span = b.time - a.time;
  return span > 0 ? between(a.pose, b.pose, (t - a.time) / span) : a.pose;
}

/**
 * Poses mixed by weight. If the weights come to less than 1, the T-pose makes up the rest; if
 * to more, they're scaled down to 1.
 */
export function blend(
  parts: readonly { readonly pose: HumanPose; readonly weight: number }[],
): HumanPose {
  const used = parts.filter((p) => p.weight > 0);
  if (used.length === 1 && used[0]!.weight >= 1) return used[0]!.pose;
  const total = Math.max(
    1,
    used.reduce((sum, p) => sum + p.weight, 0),
  );
  const sums = new Map<JointName, { x: number; y: number; z: number; w: number }>();
  let hips = v(0, 0, 0);
  const rest = 1 - used.reduce((sum, p) => sum + p.weight, 0) / total;
  for (const { pose, weight } of used) {
    const w = weight / total;
    hips = v(hips.x + pose.hips.x * w, hips.y + pose.hips.y * w, hips.z + pose.hips.z * w);
    for (const [joint, q] of pose.turns) {
      // Turns that are the same may have opposite signs; add them all on the same side.
      const k = q.w < 0 ? -w : w;
      const sum = sums.get(joint) ?? { x: 0, y: 0, z: 0, w: 0 };
      sum.x += q.x * k;
      sum.y += q.y * k;
      sum.z += q.z * k;
      sum.w += q.w * k;
      sums.set(joint, sum);
    }
  }
  const turns = new Map<JointName, Quat>();
  for (const [joint, sum] of sums) {
    // A clip without this bone holds it at the T-pose, as does the rest of the weight.
    const missing = used
      .filter((p) => !p.pose.turns.has(joint))
      .reduce((s, p) => s + p.weight / total, 0);
    const q = { ...sum, w: sum.w + missing + rest };
    const n = Math.hypot(q.x, q.y, q.z, q.w);
    turns.set(joint, { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n });
  }
  return { turns, hips };
}

/** Each bone's turn in the model's axes, from a T-pose: its parents' turns and then its own. */
export function modelTurns(pose: HumanPose): Map<JointName, Quat> {
  const out = new Map<JointName, Quat>();
  for (const { joint, parent } of HUMAN_BONES) {
    const above = parent ? out.get(parent)! : IDENTITY_Q;
    const own = pose.turns.get(joint);
    out.set(joint, own ? mul(above, own) : above);
  }
  return out;
}

/**
 * The pose from each bone's turn in the model's axes, the reverse of `modelTurns`. A bone that
 * isn't given turns as its parent does.
 */
export function fromModelTurns(world: ReadonlyMap<JointName, Quat>, hips: Vec3): HumanPose {
  const placed = new Map<JointName, Quat>();
  const turns = new Map<JointName, Quat>();
  for (const { joint, parent } of HUMAN_BONES) {
    const above = parent ? placed.get(parent)! : IDENTITY_Q;
    const own = world.get(joint);
    placed.set(joint, own ?? above);
    if (own) turns.set(joint, mul(conjugate(above), own));
  }
  return { turns, hips };
}
