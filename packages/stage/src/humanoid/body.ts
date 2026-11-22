/**
 * WP4c: a humanoid's body, from where its joints rest (`Shape.jointPlaces`): where each joint is
 * in a pose, and the pose changed to keep it on the ground, reach for a point, or look at one.
 * All in the model's axes and units, with no graphics, so both stages agree.
 */
import type { JointName, Quat, Vec3 } from '@storystage/story-api';
import { localAfter, lookTurn, reachTurns } from '../ik.ts';
import { add, axisTurns, conjugate, IDENTITY_Q, mul, rotate, sub, v } from '../math.ts';
import { HUMAN_BONES, modelTurns, slerp, type HumanPose } from './pose.ts';
import { restCorrections, tPosePlaces } from './rest.ts';

export type Hand = 'left' | 'right';

const PARENT = new Map(HUMAN_BONES.map((b) => [b.joint, b.parent]));
const J = (name: string) => name as JointName;
const HIPS = J('hips');
const FORWARD = v(0, 0, 1);
const EYES = [J('leftEye'), J('rightEye')];
/** How far eyes turn in their head, in turns: about 25 degrees. */
const EYE_LIMIT = 0.07;

/** The joints a humanoid needs for the stage to pose it. */
const NEEDED = [
  'hips',
  'spine',
  'head',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftUpperLeg',
  'leftFoot',
  'rightUpperLeg',
  'rightFoot',
].map(J);

export class Body {
  readonly hipsHeight: number;
  /** How high the lowest joint rests: about an ankle's height. */
  readonly clearance: number;
  private readonly rest: ReadonlyMap<JointName, Vec3>;

  private constructor(rest: ReadonlyMap<JointName, Vec3>) {
    // Posed from a T-pose, as the rig poses it, whatever pose the model rests in (`rest.ts`).
    this.rest = tPosePlaces(rest, restCorrections(rest));
    this.hipsHeight = rest.get(HIPS)!.y;
    this.clearance = Math.min(...[...rest.values()].map((p) => p.y));
  }

  /** A body for a model with humanoid joints where they should be, or null (a stand-in has none). */
  static of(rest: ReadonlyMap<JointName, Vec3>): Body | null {
    if (!NEEDED.every((j) => rest.has(j))) return null;
    const hips = rest.get(HIPS)!;
    const head = rest.get(J('head'))!;
    // A stand-in puts every joint in one place.
    if (!(head.y - hips.y > 0.05 && hips.y > 0.05)) return null;
    return new Body(rest);
  }

  /** Each joint the model has, where it is in a pose. */
  places(pose: HumanPose): Map<JointName, Vec3> {
    const turns = modelTurns(pose);
    const out = new Map<JointName, Vec3>();
    const h = this.hipsHeight;
    const hips = this.rest.get(HIPS)!;
    out.set(HIPS, add(hips, v(pose.hips.x * h, pose.hips.y * h, pose.hips.z * h)));
    for (const { joint } of HUMAN_BONES) {
      if (joint === HIPS || !this.rest.has(joint)) continue;
      // The nearest joint above it that the model has.
      let above = PARENT.get(joint) ?? null;
      while (above && !this.rest.has(above)) above = PARENT.get(above) ?? null;
      if (!above) continue;
      const offset = sub(this.rest.get(joint)!, this.rest.get(above)!);
      out.set(joint, add(out.get(above)!, rotate(turns.get(PARENT.get(joint)!)!, offset)));
    }
    return out;
  }

  /** The pose lowered until its lowest joint is no higher than the lowest rests, as on the ground. */
  ground(pose: HumanPose): HumanPose {
    const lowest = Math.min(...[...this.places(pose).values()].map((p) => p.y));
    if (lowest <= this.clearance + 1e-6) return pose;
    const drop = (lowest - this.clearance) / this.hipsHeight;
    return { turns: pose.turns, hips: v(pose.hips.x, pose.hips.y - drop, pose.hips.z) };
  }

  /** Where a hand is in a pose. */
  hand(pose: HumanPose, hand: Hand): Vec3 {
    return this.places(pose).get(J(`${hand}Hand`))!;
  }

  /** The hand nearer a point, at rest. */
  nearerHand(target: Vec3): Hand {
    const d = (hand: Hand) => {
      const p = sub(this.rest.get(J(`${hand}Hand`))!, target);
      return p.x * p.x + p.y * p.y + p.z * p.z;
    };
    return d('left') <= d('right') ? 'left' : 'right';
  }

  /** The pose with an arm bent to put its hand on `target`, `weight` of the way. */
  reach(pose: HumanPose, hand: Hand, target: Vec3, weight: number): HumanPose {
    if (weight <= 0) return pose;
    const upper = J(`${hand}UpperArm`);
    const lower = J(`${hand}LowerArm`);
    const places = this.places(pose);
    const turns = modelTurns(pose);
    const root = places.get(upper)!;
    // The elbow bends out, down and back, as an arm does.
    const side = hand === 'left' ? 1 : -1;
    const h = this.hipsHeight;
    const pole = add(root, v(side * 0.4 * h, -0.6 * h, -0.5 * h));
    const limb = { root, middle: places.get(lower)!, end: places.get(J(`${hand}Hand`))! };
    const bend = reachTurns(limb, target, pole);
    const upperNow = mul(bend.root, turns.get(upper)!);
    const lowerNow = mul(bend.middle, mul(bend.root, turns.get(lower)!));
    const above = turns.get(PARENT.get(upper)!)!;
    const next = new Map(pose.turns);
    next.set(
      upper,
      slerp(pose.turns.get(upper) ?? IDENTITY_Q, mul(conjugate(above), upperNow), weight),
    );
    next.set(
      lower,
      slerp(pose.turns.get(lower) ?? IDENTITY_Q, mul(conjugate(upperNow), lowerNow), weight),
    );
    return { turns: next, hips: pose.hips };
  }

  /**
   * The pose with the head turned to face `target`, `weight` of the way, by at most `limit`
   * turns: half at the neck and half at the head. Then the eyes, if the model has them, turn the
   * rest of the way, as far as eyes go (4.6).
   */
  look(pose: HumanPose, target: Vec3, weight: number, limit: number): HumanPose {
    if (weight <= 0) return pose;
    const head = J('head');
    const neck = J('neck');
    const turns = modelTurns(pose);
    const at = this.places(pose).get(head)!;
    const facing = rotate(turns.get(head)!, FORWARD);
    const turn = slerp(IDENTITY_Q, lookTurn(at, facing, target, limit), weight);
    const half = slerp(IDENTITY_Q, turn, 0.5);
    const neckNow = mul(half, turns.get(neck)!);
    const headNow = mul(turn, turns.get(head)!);
    const next = new Map(pose.turns);
    next.set(neck, localAfter(half, turns.get(neck)!, turns.get(PARENT.get(neck)!)!));
    next.set(head, mul(conjugate(neckNow), headNow));
    return this.lookWithEyes({ turns: next, hips: pose.hips }, target, weight);
  }

  /**
   * The head tipped back `turns` (a surprise), about the model's own left-right axis, the rest
   * of the body as it was. A camera with no turn looks along +Z, so tipping back turns about -X.
   * So a surprise reads on 100Avatars' small mouths (S3's decision, as S4 suggested, 19 Nov).
   */
  tipBack(pose: HumanPose, turns: number): HumanPose {
    if (turns === 0) return pose;
    const head = J('head');
    const model = modelTurns(pose);
    const headNow = mul(axisTurns(v(1, 0, 0), -turns), model.get(head)!);
    const parent = model.get(PARENT.get(head)!) ?? IDENTITY_Q;
    const next = new Map(pose.turns);
    next.set(head, mul(conjugate(parent), headNow));
    return { turns: next, hips: pose.hips };
  }

  /** Each eye the model has turned towards `target`, `weight` of the way, within its limit. */
  private lookWithEyes(pose: HumanPose, target: Vec3, weight: number): HumanPose {
    const eyes = EYES.filter((eye) => this.rest.has(eye));
    if (eyes.length === 0) return pose;
    const turns = modelTurns(pose);
    const places = this.places(pose);
    const next = new Map(pose.turns);
    for (const eye of eyes) {
      const now = turns.get(eye)!;
      const turn = slerp(
        IDENTITY_Q,
        lookTurn(places.get(eye)!, rotate(now, FORWARD), target, EYE_LIMIT),
        weight,
      );
      next.set(eye, mul(conjugate(turns.get(PARENT.get(eye)!)!), mul(turn, now)));
    }
    return { turns: next, hips: pose.hips };
  }
}

export type { Quat };
