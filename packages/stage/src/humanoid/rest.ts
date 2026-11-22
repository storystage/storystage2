/**
 * WP4.6: humanoids that don't rest in a T-pose. A pose's turns are measured from a T-pose
 * (`pose.ts`), so a model resting in an A-pose, with its arms hanging, as MakeHuman's people do,
 * would hold every pose's arms that much too low. This works out, from where a model's joints
 * rest, the turn that takes each arm and leg bone to where a T-pose has it. The rig and the body
 * both use it, so what's drawn and where the stage thinks the hands are agree.
 */
import type { JointName, Quat, Vec3 } from '@storystage/story-api';
import { turnBetween } from '../ik.ts';
import { add, rotate, sub, v } from '../math.ts';
import { HUMAN_BONES } from './pose.ts';

const J = (name: string) => name as JointName;

/** Each bone set straight in a T-pose: the joint it points at, and which way, facing +Z. */
const AIMS: ReadonlyMap<JointName, { readonly to: JointName; readonly way: Vec3 }> = new Map(
  (['left', 'right'] as const).flatMap((side) => {
    const out = v(side === 'left' ? 1 : -1, 0, 0);
    const down = v(0, -1, 0);
    return [
      [J(`${side}UpperArm`), { to: J(`${side}LowerArm`), way: out }],
      [J(`${side}LowerArm`), { to: J(`${side}Hand`), way: out }],
      [J(`${side}UpperLeg`), { to: J(`${side}LowerLeg`), way: down }],
      [J(`${side}LowerLeg`), { to: J(`${side}Foot`), way: down }],
    ] as const;
  }),
);

const PARENT = new Map(HUMAN_BONES.map((b) => [b.joint, b.parent]));

/**
 * The turn, in the model's axes, that takes each bone from where it rests to where a T-pose has
 * it. A hand, a foot or a finger turns with the bone it hangs from. Bones a T-pose already has
 * straight have none.
 */
export function restCorrections(places: ReadonlyMap<JointName, Vec3>): Map<JointName, Quat> {
  const out = new Map<JointName, Quat>();
  for (const { joint, parent } of HUMAN_BONES) {
    const aim = AIMS.get(joint);
    const from = places.get(joint);
    const to = aim && places.get(aim.to);
    if (aim && from && to) {
      out.set(joint, turnBetween(sub(to, from), aim.way));
      continue;
    }
    // A bone with no aim of its own turns as the nearest bone above it that has one.
    for (let above = parent; above; above = PARENT.get(above) ?? null) {
      const q = out.get(above);
      if (q) {
        out.set(joint, q);
        break;
      }
    }
  }
  return out;
}

/** Where each joint would be if the model rested in a T-pose: its places, with each bone set straight. */
export function tPosePlaces(
  places: ReadonlyMap<JointName, Vec3>,
  corrections: ReadonlyMap<JointName, Quat>,
): Map<JointName, Vec3> {
  const out = new Map<JointName, Vec3>();
  for (const { joint } of HUMAN_BONES) {
    const at = places.get(joint);
    if (!at) continue;
    let above = PARENT.get(joint) ?? null;
    while (above && !places.has(above)) above = PARENT.get(above) ?? null;
    if (!above) {
      out.set(joint, at);
      continue;
    }
    // The bone above carries this joint; set straight, it carries it straight too.
    const turn = corrections.get(above);
    const offset = sub(at, places.get(above)!);
    out.set(joint, add(out.get(above)!, turn ? rotate(turn, offset) : offset));
  }
  return out;
}
