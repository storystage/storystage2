/**
 * WP0.8 contract: what a running program asks of the stage, what it can ask back, and what the
 * stage tells it. The runtime worker sends these over its messages (`@storystage/runtime`), and
 * a bridge on the main thread hands them to the stage (`@storystage/stage`).
 *
 * The design follows spike 1.4 (`docs/spikes/REPORT.md`):
 * - commands carry a start time and a duration on the scene clock, and are sent ahead of time;
 * - movements are **relative and additive**, so overlapping commands on one object compose in
 *   any order and the scene at any time is a pure function of the commands so far;
 * - anything that depends on where things are when a command starts ("move to", "turn to
 *   face", "forward") is worked out by the stage at that start time, so the runtime doesn't need
 *   its own copy of the scene.
 */
import type {
  AnimationStyle,
  JointName,
  Micros,
  ObjectId,
  ShotType,
  Transform,
  Vec3,
} from './vocabulary.ts';

/**
 * Which axes a relative command uses: the scene's, the object's own (as they are when the
 * command starts), or another object's (Alice's "as seen by").
 */
export type Space = 'scene' | 'self' | { readonly asSeenBy: ObjectId };

interface Timed {
  /** Unique and increasing per run; ties at the same start time are applied in this order. */
  readonly seq: number;
  readonly object: ObjectId;
  readonly start: Micros;
  /** 0 means instant. */
  readonly duration: Micros;
  readonly style: AnimationStyle;
}

export type StageCommand =
  /** Move by a distance, in metres, along the given axes. */
  | (Timed & { readonly kind: 'translate'; readonly by: Vec3; readonly space: Space })
  /** Turn about an axis, in turns (Alice's "revolutions": 0.25 is a quarter turn). */
  | (Timed & {
      readonly kind: 'rotate';
      readonly axis: Vec3;
      readonly turns: number;
      readonly space: Space;
    })
  /** Resize by a factor per axis (1 is no change). */
  | (Timed & { readonly kind: 'resize'; readonly factor: Vec3 })
  /** Move to another object's position, or a point; the stage works out the distance at `start`. */
  | (Timed & { readonly kind: 'moveTo'; readonly target: ObjectId | Vec3 })
  /** Turn to face another object; worked out at `start`. */
  | (Timed & { readonly kind: 'turnToFace'; readonly target: ObjectId })
  /** Turn one joint, in turns, about an axis in the joint's own space. */
  | (Timed & {
      readonly kind: 'joint';
      readonly joint: JointName;
      readonly axis: Vec3;
      readonly turns: number;
    })
  /** Fade to an opacity, 0 to 1. */
  | (Timed & { readonly kind: 'opacity'; readonly to: number })
  /** Change paint (instant). */
  | (Timed & { readonly kind: 'paint'; readonly paint: string })
  /** Show a speech or thought bubble for the duration. */
  | (Timed & { readonly kind: 'say'; readonly text: string; readonly bubble: 'say' | 'think' })
  /** Ride on another object, or on the scene again (instant). */
  | (Timed & { readonly kind: 'vehicle'; readonly vehicle: ObjectId | null })
  /** The camera frames its targets with a shot type (WP4.10); `object` is the camera. */
  | (Timed & {
      readonly kind: 'shot';
      readonly shot: ShotType;
      readonly targets: readonly ObjectId[];
    });

export type StageCommandKind = StageCommand['kind'];

/** Questions a running program can ask (the Story API's functions). Answered on the main thread. */
export type StageQuery =
  | { readonly kind: 'transform'; readonly object: ObjectId; readonly at: Micros }
  | {
      readonly kind: 'distance';
      readonly from: ObjectId;
      readonly to: ObjectId;
      readonly at: Micros;
    }
  | {
      readonly kind: 'isColliding';
      readonly a: ObjectId;
      readonly b: ObjectId;
      readonly at: Micros;
    }
  | { readonly kind: 'isVisible'; readonly object: ObjectId; readonly at: Micros };

export type StageQueryResult =
  | { readonly kind: 'transform'; readonly value: Transform }
  | { readonly kind: 'distance'; readonly value: number }
  | { readonly kind: 'isColliding' | 'isVisible'; readonly value: boolean };

/** What the stage and the learner do that a program's events listen for (WP6.2). */
export type StageEvent =
  | { readonly kind: 'click'; readonly object: ObjectId | null; readonly at: Micros }
  | { readonly kind: 'key'; readonly key: string; readonly at: Micros }
  | {
      readonly kind: 'collisionStart';
      readonly a: ObjectId;
      readonly b: ObjectId;
      readonly at: Micros;
    }
  | {
      readonly kind: 'proximityEnter';
      readonly a: ObjectId;
      readonly b: ObjectId;
      readonly distance: number;
      readonly at: Micros;
    };

/** Error codes the stage reports. The words the learner sees are chosen from the code elsewhere. */
export const STAGE_ERROR_CODES = [
  'unknown_object',
  'unknown_joint',
  'unknown_model',
  'bad_argument',
] as const;
export type StageErrorCode = (typeof STAGE_ERROR_CODES)[number];

export class StageError extends Error {
  readonly code: StageErrorCode;
  constructor(code: StageErrorCode, message: string) {
    super(message);
    this.name = 'StageError';
    this.code = code;
  }
}
