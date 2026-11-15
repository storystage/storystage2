/**
 * A character's pose, as the Pose panel edits it (`07-ux.md` section 7.2; S3's #424): each joint's
 * turn from rest is a unit quaternion in the joint's own axes (`SceneObjectSetup.joints`). The
 * panel shows it as three turns, put together in one fixed order, heading (about the joint's y),
 * then tilt (x), then roll (z), as a camera's turns read, and read back by the same order's
 * decomposition, so a pose shows the numbers that were typed (S3's advice).
 */
import type { Production, SceneId } from '@storystage/production';
import type { JointName, Quat } from '@storystage/story-api';
import { jointWord, jointsOf, skeletonOf } from '@storystage/backstage';
import type { StoryClass } from '@storystage/story-api';

export const AXES = ['heading', 'tilt', 'roll'] as const;
export type Axis = (typeof AXES)[number];
export type JointTurns = Readonly<Record<Axis, number>>;

/**
 * How far each field turns a joint either way, in turns. Spec 03 gives joints no limits, so half a
 * turn either way about each axis; tilt reads back within a quarter, as the decomposition gives it.
 */
export const POSE_LIMITS: Readonly<Record<Axis, number>> = { heading: 0.5, tilt: 0.25, roll: 0.5 };
/** The fields' stepper: a fortieth of a turn, 9 degrees. */
export const POSE_STEP = 0.025;

export const REST: Quat = { x: 0, y: 0, z: 0, w: 1 };
export const AT_REST: JointTurns = { heading: 0, tilt: 0, roll: 0 };

const TAU = 2 * Math.PI;

const mul = (a: Quat, b: Quat): Quat => ({
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
});

const about = (axis: 'x' | 'y' | 'z', turns: number): Quat => {
  const half = (turns * TAU) / 2;
  return { ...REST, w: Math.cos(half), [axis]: Math.sin(half) };
};

const clamp = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v));
/** To a thousandth of a turn, with no -0. */
const tidy = (turns: number) => Math.round(turns * 1000) / 1000 + 0;

/** A joint's turn from its three turns: heading, then tilt, then roll. */
export function jointTurn(t: JointTurns): Quat {
  const q = mul(
    about('y', clamp(t.heading, POSE_LIMITS.heading)),
    mul(about('x', clamp(t.tilt, POSE_LIMITS.tilt)), about('z', clamp(t.roll, POSE_LIMITS.roll))),
  );
  const n = Math.hypot(q.x, q.y, q.z, q.w);
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

/** A joint's three turns from its turn: the same order's decomposition (Y, then X, then Z). */
export function jointTurns(q: Quat): JointTurns {
  const { x, y, z, w } = q;
  const m13 = 2 * (x * z + w * y);
  const m23 = 2 * (y * z - w * x);
  const m33 = 1 - 2 * (x * x + y * y);
  const m21 = 2 * (x * y + w * z);
  const m22 = 1 - 2 * (x * x + z * z);
  const m11 = 1 - 2 * (y * y + z * z);
  const m31 = 2 * (x * z - w * y);
  const tilt = Math.asin(-Math.min(1, Math.max(-1, m23)));
  // Tilted a quarter turn, heading and roll turn about the same line: all of it is heading.
  const level = Math.abs(m23) < 0.9999999;
  const heading = level ? Math.atan2(m13, m33) : Math.atan2(-m31, m11);
  const roll = level ? Math.atan2(m21, m22) : 0;
  return { heading: tidy(heading / TAU), tilt: tidy(tilt / TAU), roll: tidy(roll / TAU) };
}

/** Whether two turns are the same turn (q and -q are). */
export const sameTurn = (a: Quat, b: Quat): boolean =>
  Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w) > 1 - 1e-9;

/** A joint's turn in an object's set-up: at rest when it isn't posed. */
export function turnOfJoint(
  joints: { readonly [joint: JointName]: Quat } | undefined,
  joint: JointName,
): Quat {
  return joints?.[joint] ?? REST;
}

/**
 * The production with one joint of one object posed, or back at rest (`null`, or a turn that is
 * rest): a joint at rest is left out, and an object with none posed has no `joints`.
 */
export function withJoint(
  p: Production,
  scene: SceneId,
  object: string,
  joint: JointName,
  turn: Quat | null,
): Production {
  return {
    ...p,
    scenes: p.scenes.map((s) =>
      s.id !== scene
        ? s
        : {
            ...s,
            setup: {
              ...s.setup,
              objects: s.setup.objects.map((o) => {
                if (o.id !== object) return o;
                const kept = { ...o.joints };
                delete kept[joint];
                if (turn && !sameTurn(turn, REST)) kept[joint] = turn;
                const posed = { ...o, joints: kept };
                if (Object.keys(kept).length === 0) delete (posed as { joints?: unknown }).joints;
                return posed;
              }),
            },
          },
    ),
  };
}

/** A joint the Pose panel offers, with its word on the blocks ("left elbow"). */
export interface PoseJoint {
  readonly id: JointName;
  readonly word: string;
}

/**
 * The joints a model can be posed by, every one it has (a saved film keeps them all, S4's 1.5.0):
 * first those of its class's joint map, in the map's order (body, then arms, legs, hands,
 * extras), then its own, as it lists them ("plumage center tip"). None for a prop or a class
 * without joints.
 */
export function poseJoints(
  cls: StoryClass,
  has: readonly JointName[] | 'prop-only' | undefined,
): PoseJoint[] {
  const skeleton = skeletonOf(cls);
  if (!skeleton || !has || has === 'prop-only') return [];
  const mapped = jointsOf(skeleton).map((d) => d.id as string);
  const inMap = new Set(mapped);
  const own = new Set<string>(has);
  return [...mapped.filter((id) => own.has(id)), ...has.filter((id) => !inMap.has(id))].map(
    (id) => ({ id: id as JointName, word: jointWord(skeleton, id as JointName) }),
  );
}
