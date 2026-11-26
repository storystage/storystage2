/**
 * Drag posing (5.9, decision 0073), pure: which joints a hand or foot handle bends, which way an
 * elbow or a knee bends, and where a dragged handle goes. The stage turns the joints by the
 * two-joint solver in `ik.ts`; joints only turn (0051).
 */
import type { JointName, Quat, Vec3 } from '@storystage/story-api';
import type { PoseHandle } from './contract.ts';
import type { Ray } from './editing.ts';
import { add, dot, length, rotate, scale, sub, v } from './math.ts';

/** Every pose handle, in the order the Pose panel lists them. */
export const POSE_HANDLES: readonly PoseHandle[] = [
  'leftHand',
  'rightHand',
  'leftFoot',
  'rightFoot',
];

/** How near a pose handle, in CSS pixels, a press takes hold of it: a 44 px target (07-ux 7.4). */
export const POSE_REACH = 22;

/** A limb's three joints: the root (a shoulder or hip), the middle (an elbow or knee), the end. */
export interface LimbJoints {
  readonly root: JointName;
  readonly middle: JointName;
  readonly end: JointName;
}

const J = (name: string) => name as JointName;

/** The joints a handle bends: its arm or its leg. */
export function limbOf(handle: PoseHandle): LimbJoints {
  const side = handle.startsWith('left') ? 'left' : 'right';
  return handle.endsWith('Hand')
    ? { root: J(`${side}UpperArm`), middle: J(`${side}LowerArm`), end: J(`${side}Hand`) }
    : { root: J(`${side}UpperLeg`), middle: J(`${side}LowerLeg`), end: J(`${side}Foot`) };
}

/**
 * The point a limb's middle joint bends towards, in the scene: an elbow out, down and back, as an
 * arm does; a knee forwards. `facing` is the object's turn (it faces +Z, with +X on its left).
 */
export function poleFor(
  handle: PoseHandle,
  limb: { readonly root: Vec3; readonly middle: Vec3; readonly end: Vec3 },
  facing: Quat,
): Vec3 {
  const reach = length(sub(limb.middle, limb.root)) + length(sub(limb.end, limb.middle));
  const out = handle.startsWith('left') ? 1 : -1;
  const way = handle.endsWith('Hand') ? v(out * 0.5, -0.5, -0.6) : v(0, -0.5, 0.8);
  return add(limb.root, scale(rotate(facing, way), reach));
}

/**
 * Where a pointer's line of sight meets the plane through `through` that faces the view (its
 * normal the view's forward): a dragged hand or foot stays as far from the view as it was.
 * Null if the line of sight runs along the plane.
 */
export function onFacingPlane(ray: Ray, through: Vec3, forward: Vec3): Vec3 | null {
  const across = dot(ray.direction, forward);
  if (Math.abs(across) < 1e-9) return null;
  const distance = dot(sub(through, ray.origin), forward) / across;
  if (!(distance > 0)) return null;
  return add(ray.origin, scale(ray.direction, distance));
}
