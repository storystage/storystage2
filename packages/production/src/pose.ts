/**
 * Format 1.5.0: an object's pose in its set-up (`SceneObjectSetup.joints`; 07-ux section 7.2;
 * spec 03 section 2.2, agreed with S3 in #424). Each entry is a joint's turn from its rest pose,
 * in the joint's own axes, as a unit quaternion; a joint left out stays at rest.
 *
 * A pose is the learner's choice, like a voice, so an entry that doesn't fit is dropped when the
 * file opens, never the file. The stage refuses a turn that isn't a unit quaternion and stops the
 * scene loading, so nothing it would refuse gets through here (`POSE_TOLERANCE` is the stage's
 * own). Whether the model has the joint is the stage's to judge: it leaves out a joint its model
 * hasn't got, and the scene plays on.
 */
import { jointsOf, skeletonOf } from '@storystage/backstage';
import type { Quat, SceneObjectSetup, StoryClass } from '@storystage/story-api';

/** How far a turn's length may be from 1 and still be kept: the stage's tolerance, too. */
export const POSE_TOLERANCE = 1e-3;

const QUAT_KEYS = ['x', 'y', 'z', 'w'] as const;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

const names = new Map<StoryClass, ReadonlySet<string>>();

/**
 * The joint names an object of class `cls` may be posed by: its skeleton's joints and the extras
 * every class may have (`jointsOf`, `@storystage/backstage`). None for a class without joints.
 */
export function poseJoints(cls: StoryClass): ReadonlySet<string> {
  let got = names.get(cls);
  if (!got) {
    const skeleton = skeletonOf(cls);
    got = new Set(skeleton ? jointsOf(skeleton).map((d) => d.id as string) : []);
    names.set(cls, got);
  }
  return got;
}

/** Whether `v` is a turn the format keeps: `{ x, y, z, w }`, finite, within 1e-3 of unit length. */
export function isPoseTurn(v: unknown): v is Quat {
  if (!isPlainObject(v)) return false;
  const keys = Object.keys(v);
  if (keys.length !== QUAT_KEYS.length || !QUAT_KEYS.every((k) => keys.includes(k))) return false;
  const [x, y, z, w] = QUAT_KEYS.map((k) => v[k]);
  if (![x, y, z, w].every((n) => typeof n === 'number' && Number.isFinite(n))) return false;
  return (
    Math.abs(Math.hypot(x as number, y as number, z as number, w as number) - 1) <= POSE_TOLERANCE
  );
}

/**
 * What an object keeps of its pose when the file opens (spec 03 section 2.2), and why each of the
 * rest was dropped, for developers. Kept turns are as written, never normalised. None is kept for
 * a declared stand-in (`model` is `{ standIn }`), or when nothing fits, so a file never carries an
 * empty `joints`.
 */
export function keptJoints(
  object: Pick<SceneObjectSetup, 'model' | 'class'> & { readonly joints?: unknown },
  where: string,
): { readonly joints: SceneObjectSetup['joints']; readonly dropped: readonly string[] } {
  const v = object.joints;
  if (v === undefined) return { joints: undefined, dropped: [] };
  if (typeof object.model !== 'string')
    return { joints: undefined, dropped: [`${where}: dropped: a stand-in has no pose`] };
  if (!isPlainObject(v))
    return { joints: undefined, dropped: [`${where}: dropped: should be an object`] };
  const allowed = poseJoints(object.class);
  const dropped: string[] = [];
  // Names are looked up in a Set and the result is built with `Object.fromEntries`, so a key such
  // as `__proto__` or `constructor` is only a name that isn't a joint, never Object's own member.
  const kept = Object.entries(v).filter(([joint, turn]) => {
    if (!allowed.has(joint))
      dropped.push(`${where}.${joint}: dropped: not a joint of a ${object.class}`);
    else if (!isPoseTurn(turn))
      dropped.push(`${where}.${joint}: dropped: should be a unit quaternion { x, y, z, w }`);
    else return true;
    return false;
  });
  return {
    joints: kept.length ? (Object.fromEntries(kept) as SceneObjectSetup['joints']) : undefined,
    dropped,
  };
}
