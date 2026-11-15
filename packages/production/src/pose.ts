/**
 * Format 1.5.0: an object's pose in its set-up (`SceneObjectSetup.joints`; 07-ux section 7.2;
 * spec 03 section 2.2, agreed with S3 in #424). Each entry is a joint's turn from its rest pose,
 * in the joint's own axes, as a unit quaternion; a joint left out stays at rest.
 *
 * A pose is the learner's choice, like a voice, so an entry that doesn't fit is dropped when the
 * file opens, never the file. The stage refuses a turn that isn't a unit quaternion and stops the
 * scene loading, so nothing it would refuse gets through here (`POSE_TOLERANCE` is the stage's
 * own).
 *
 * Names must be well-formed joint ids, not joints of the class's skeleton: a model may have joints
 * of its own beyond it (an Alice model's `plumageCenterTip`, `jointFromAlice`), and the Pose panel
 * lists the model's own. Whether the model has the joint is the stage's to judge (it leaves out
 * one it lacks, and the scene plays on) and `checkFilm`'s to name.
 */
import { skeletonOf } from '@storystage/backstage';
import type { Quat, SceneObjectSetup } from '@storystage/story-api';

/** How far a turn's length may be from 1 and still be kept: the stage's tolerance, too. */
export const POSE_TOLERANCE = 1e-3;

/** The most joints one object's pose holds; the rest are dropped. Far more than any model has. */
export const POSE_JOINTS_MAX = 256;

/**
 * A well-formed joint id: camelCase letters and digits, as the joint map names every joint, its
 * skeletons' and extras' and those `jointFromAlice` makes from Alice's names (`hair2`,
 * `plumageCenterTip`). Underscores never appear, so `__proto__` and its kin can't match.
 */
export const JOINT_ID = /^[a-z][A-Za-z0-9]{0,63}$/;

/**
 * Object.prototype's own member names (`constructor`, `toString`, `valueOf`, `hasOwnProperty`…).
 * Some match `JOINT_ID`, and a pose is an object keyed by name, so code reading `joints[name]`
 * for one of them would find Object's function rather than a turn. No joint is named so.
 */
const OBJECT_MEMBERS: ReadonlySet<string> = new Set(Object.getOwnPropertyNames(Object.prototype));

/** Whether `name` may name a joint in a pose: a well-formed joint id, never Object's member. */
export const isJointId = (name: string): boolean =>
  JOINT_ID.test(name) && !OBJECT_MEMBERS.has(name);

const QUAT_KEYS = ['x', 'y', 'z', 'w'] as const;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

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

/** A name from a file, short enough for a message. */
const shown = (name: string) => (name.length > 64 ? `${name.slice(0, 64)}…` : name);

/**
 * What an object keeps of its pose when the file opens (spec 03 section 2.2), and why each of the
 * rest was dropped, for developers. Kept turns are as written, never normalised. None is kept for
 * a declared stand-in (`model` is `{ standIn }`) or a class with no joints, or when nothing fits,
 * so a file never carries an empty `joints`.
 */
export function keptJoints(
  object: Pick<SceneObjectSetup, 'model' | 'class'> & { readonly joints?: unknown },
  where: string,
): { readonly joints: SceneObjectSetup['joints']; readonly dropped: readonly string[] } {
  const v = object.joints;
  if (v === undefined) return { joints: undefined, dropped: [] };
  const none = (why: string) => ({ joints: undefined, dropped: [`${where}: dropped: ${why}`] });
  if (typeof object.model !== 'string') return none('a stand-in has no pose');
  if (skeletonOf(object.class) === null)
    return none(`not posable: a ${object.class} has no joints`);
  if (!isPlainObject(v)) return none('should be an object');
  const dropped: string[] = [];
  const kept: [string, unknown][] = [];
  let over = 0;
  // Built with `Object.fromEntries`, which defines each name as the result's own key.
  for (const [joint, turn] of Object.entries(v)) {
    if (!isJointId(joint)) dropped.push(`${where}.${shown(joint)}: dropped: not a joint name`);
    else if (!isPoseTurn(turn))
      dropped.push(`${where}.${joint}: dropped: should be a unit quaternion { x, y, z, w }`);
    else if (kept.length >= POSE_JOINTS_MAX) over++;
    else kept.push([joint, turn]);
  }
  if (over > 0)
    dropped.push(`${where}: dropped ${over} more: a pose holds at most ${POSE_JOINTS_MAX} joints`);
  return {
    joints: kept.length ? (Object.fromEntries(kept) as SceneObjectSetup['joints']) : undefined,
    dropped,
  };
}
