/**
 * A walk written in code, for an animal with legs but no walk clip of its own (Styloo's cat and
 * giraffe), and a wing beat for a flyer with wings but no fly clip. Pure, so the timeline can
 * use it, and a film is posed the same way at the same moment.
 *
 * - **Four legs:** a walk puts its feet down one at a time, back left, front left, back right,
 *   front right; a run trots, a front leg with the back leg across from it.
 * - **Two legs** (a bird, such as S4's chick): one foot, then the other, walking and running.
 * - **Feet planted:** a leg's turn follows the ground covered, not the clock, so a foot on the
 *   ground stays where it is while the body goes over it (the owner's choice for animals, 19 Nov).
 *   It's down about two thirds of a walk and under half a run (`ON_THE_GROUND`).
 * - **Its own pace:** how fast an animal walks comes from how long its legs are, as it does in
 *   life, so a giraffe strides and a cat pads (a Froude number: speed² = F × g × leg length).
 * - **Wings** beat while it moves, faster for smaller wings, if it has no legs to walk on.
 */
import type { JointName, Quat, Vec3 } from '@storystage/story-api';
import { ON_THE_GROUND } from './gaits.ts';
import type { Box } from './hull.ts';
import { axisTurns, IDENTITY_Q, mul, v } from './math.ts';

type Moving = 'walk' | 'run';

const GRAVITY = 9.81;
/** Speed² over g × leg length: an unhurried walk, and a trot. */
const FROUDE: Record<Moving, number> = { walk: 0.1, run: 0.8 };
/** How far one whole cycle of steps goes, in leg lengths. */
const STRIDE: Record<Moving, number> = { walk: 1.2, run: 2.4 };
/** Where in the cycle each foot comes down: a walk one at a time, a trot two across. */
const PHASE: Record<Moving, Record<string, number>> = {
  walk: { backLeft: 0, frontLeft: 0.25, backRight: 0.5, frontRight: 0.75, left: 0, right: 0.5 },
  run: { frontLeft: 0, backRight: 0, frontRight: 0.5, backLeft: 0.5, left: 0, right: 0.5 },
};
/** How far a knee bends to lift its foot, at the top of a step, in turns. */
const LIFT = 0.06;
/** How far a wing beats up and down from rest, in turns. */
const WING_BEAT = 0.1;

const SIDEWAYS = v(1, 0, 0);
const FORWARD = v(0, 0, 1);

export interface CodedLeg {
  /** Where it should come down in the cycle: `walk`'s and `run`'s. */
  readonly phase: Record<Moving, number>;
  readonly front: boolean;
  /** The shoulder or hip. A bird's leg is like a four-legged animal's back leg. */
  readonly upper: JointName;
  readonly knee: JointName;
  /** Below the knee: a front leg's ankle, a back leg's hock, a bird's ankle. */
  readonly lower: JointName | null;
  /** From its shoulder or hip to the ground, in metres at scale 1. */
  readonly length: number;
}

export interface CodedGait {
  readonly legs: readonly CodedLeg[];
  /** Each wing's shoulder, and which way it reaches across (+1 or -1). */
  readonly wings: readonly { readonly joint: JointName; readonly side: number }[];
  /** Its legs' length, on average, in metres at scale 1; 0 without legs. */
  readonly legLength: number;
  /** Wing beats a second. */
  readonly beat: number;
}

/**
 * The walk in code for a model with these joints resting at these places, or null if it has
 * neither four legs, two legs nor wings. A stand-in's joints all rest at one place, so it has
 * none of them.
 */
export function codedGait(
  joints: readonly JointName[],
  places: ReadonlyMap<JointName, Vec3>,
  box: Box,
): CodedGait | null {
  const has = new Set(joints);
  const at = (j: string) => (has.has(j as JointName) ? (places.get(j as JointName) ?? null) : null);
  const leg = (name: string, front: boolean, upper: string, lower: string): CodedLeg[] => {
    const top = at(upper);
    const bend = at(`${name}Knee`);
    if (!top || !bend || !(top.y - bend.y > 1e-3) || !(top.y - box.min.y > 1e-2)) return [];
    return [
      {
        phase: { walk: PHASE.walk[name]!, run: PHASE.run[name]! },
        front,
        upper: upper as JointName,
        knee: `${name}Knee` as JointName,
        lower: at(lower) ? (lower as JointName) : null,
        length: top.y - box.min.y,
      },
    ];
  };
  const four = (['front', 'back'] as const).flatMap((end) =>
    (['Left', 'Right'] as const).flatMap((side) => {
      const name = `${end}${side}`;
      return end === 'front'
        ? leg(name, true, `${name}Shoulder`, `${name}Ankle`)
        : leg(name, false, `${name}Hip`, `${name}Hock`);
    }),
  );
  const two = (['left', 'right'] as const).flatMap((name) =>
    leg(name, false, `${name}Hip`, `${name}Ankle`),
  );
  const legs = four.length === 4 ? four : two.length === 2 ? two : [];
  const middle = (box.min.x + box.max.x) / 2;
  const wings = (['left', 'right'] as const).flatMap((side) => {
    const joint = `${side}WingShoulder`;
    const place = at(joint);
    const tip = at(`${side}WingTip`) ?? at(`${side}WingWrist`) ?? at(`${side}WingElbow`);
    const across = (tip ?? place)?.x ?? middle;
    if (!place || Math.abs(across - middle) < 1e-3) return [];
    return [{ joint: joint as JointName, side: Math.sign(across - middle) }];
  });
  if (legs.length === 0 && wings.length === 0) return null;
  const legLength = legs.length ? legs.reduce((sum, l) => sum + l.length, 0) / legs.length : 0;
  // Smaller wings beat faster: about 4 a second for a butterfly's 10 cm, 2 for half a metre.
  const span = Math.max(1e-2, box.max.x - box.min.x);
  const beat = Math.min(8, Math.max(1, 1.3 / Math.sqrt(span)));
  return { legs, wings, legLength, beat };
}

/** How fast it walks or runs, in metres a second at scale 1; null without legs. */
export function codedSpeed(gait: CodedGait, moving: Moving): number | null {
  if (gait.legLength === 0) return null;
  return legPace(gait.legLength, moving);
}

/** A natural pace for legs this long, in metres a second: an unhurried walk, or a trot. */
export function legPace(legLength: number, moving: Moving): number {
  return Math.sqrt(FROUDE[moving] * GRAVITY * legLength);
}

/**
 * How long an animal's legs are taken to be when they can't be found, as a share of its height:
 * Gobkit's, whose one bone a leg isn't fitted to the mesh (S4, 20 Nov).
 */
export const LEG_SHARE = 0.5;

/** How far one whole cycle of steps goes, in metres at scale 1; null without legs. */
export function codedStride(gait: CodedGait, moving: Moving): number | null {
  if (gait.legLength === 0) return null;
  return STRIDE[moving] * gait.legLength;
}

/**
 * Where a leg is `c` of the way through a cycle (0 to 1), as it comes down at 0: how far its foot
 * is forward (1) or back (-1), and how far it's lifted (0 to 1). On the ground, the foot goes
 * back steadily, as fast as the body goes forward; off it, it swings forward and up.
 */
export function legAt(c: number, onGround: number): { forward: number; lift: number } {
  const t = c - Math.floor(c);
  if (t < onGround) return { forward: 1 - (2 * t) / onGround, lift: 0 };
  const s = (t - onGround) / (1 - onGround);
  return { forward: -Math.cos(Math.PI * s), lift: Math.sin(Math.PI * s) };
}

/** A walk or run in code at a moment: `cycles` of its steps done, counting for `weight`. */
export interface CodedLayer {
  readonly moving: Moving;
  readonly cycles: number;
  readonly weight: number;
}

/**
 * Each joint's turn, in the model's own axes, for its walk and run in code at a moment. A leg
 * swings about the model's sideways axis, its foot as far forward and back as the stride and its
 * time on the ground say; a knee lifts its foot; a wing beats about the way the model faces.
 */
export function codedTurns(
  gait: CodedGait,
  layers: readonly CodedLayer[],
): ReadonlyMap<JointName, Quat> {
  const sideways = new Map<JointName, number>();
  const forward = new Map<JointName, number>();
  const add = (into: Map<JointName, number>, joint: JointName, turns: number) =>
    into.set(joint, (into.get(joint) ?? 0) + turns);
  for (const { moving, cycles, weight } of layers) {
    if (weight <= 0) continue;
    const onGround = ON_THE_GROUND[moving];
    const stride = codedStride(gait, moving);
    for (const leg of gait.legs) {
      // On the ground, the foot goes back by the ground covered: `onGround` of a stride.
      const reach = Math.min(0.9, (onGround * stride!) / (2 * leg.length));
      const swing = Math.asin(reach) / (2 * Math.PI);
      const { forward: ahead, lift } = legAt(cycles - leg.phase[moving], onGround);
      // A turn about the sideways axis takes a foot back; forward is the other way.
      add(sideways, leg.upper, -swing * ahead * weight);
      // A front leg's knee folds forward and its paw back; a back leg's knee back, its foot forward.
      const bend = LIFT * lift * weight;
      add(sideways, leg.knee, leg.front ? -bend : bend);
      if (leg.lower) add(sideways, leg.lower, leg.front ? 1.5 * bend : -bend);
    }
    // A bird with legs walks on them, its wings still.
    if (gait.legs.length === 0)
      for (const { joint, side } of gait.wings)
        add(forward, joint, side * WING_BEAT * Math.sin(2 * Math.PI * cycles) * weight);
  }
  const turns = new Map<JointName, Quat>();
  for (const joint of new Set([...sideways.keys(), ...forward.keys()]))
    turns.set(
      joint,
      mul(
        forward.has(joint) ? axisTurns(FORWARD, forward.get(joint)!) : IDENTITY_Q,
        sideways.has(joint) ? axisTurns(SIDEWAYS, sideways.get(joint)!) : IDENTITY_Q,
      ),
    );
  return turns;
}
