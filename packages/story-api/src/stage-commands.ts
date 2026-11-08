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
 *
 * Colours are paints: a name from the Story API's `Color` list, or `#rrggbb`. The sky, light and
 * fog belong to the scene, so their commands and questions use the object `SCENE`.
 */
import type { ENUMS } from './catalog/types.ts';
import type {
  AnimationStyle,
  JointName,
  Micros,
  ObjectId,
  ShotType,
  Transform,
  Vec3,
} from './vocabulary.ts';

type EnumOf<K extends keyof typeof ENUMS> = (typeof ENUMS)[K][number];

/**
 * What a command or question can be about besides a point: an object, a marker (by its id, as
 * `SceneSetup.markers` has it) or one of an object's joints (spec 02, section 5, rule 6).
 */
export type Target = ObjectId | { readonly object: ObjectId; readonly joint: JointName };

/**
 * Which axes a relative command uses: the scene's, the object's own (as they are when the
 * command starts), or another object's or a marker's (Alice's "as seen by").
 */
export type Space = 'scene' | 'self' | { readonly asSeenBy: ObjectId };

/** How a speech or thought bubble looks: Alice's details on `say` and `think`. */
export interface BubbleLook {
  readonly position: EnumOf<'BubblePosition'>;
  readonly textScale: number;
  readonly textStyle: EnumOf<'TextStyle'>;
  readonly font: EnumOf<'TextFont'>;
  readonly textColour: string;
  readonly fillColour: string;
  readonly outlineColour: string;
}

/** How the stage chooses an orientation (Alice's `orientToUpright`, `pointAt`, `orientTo`). */
export type Orientation =
  /** Upright, keeping the way it faces. */
  | 'upright'
  /** Facing straight at the target, its top towards `up`. */
  | { readonly pointAt: Target }
  /** The same way round as the target. */
  | { readonly lineUpWith: Target };

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
  /**
   * Resize by a factor per axis (1 is no change). Keeping the volume (`isVolumePreserved`) is
   * the Story API's sum, not the stage's: it sends the factors that do it.
   */
  | (Timed & { readonly kind: 'resize'; readonly factor: Vec3 })
  /** Set one dimension, in metres, keeping what `policy` says; worked out at `start`. */
  | (Timed & {
      readonly kind: 'setSize';
      readonly dimension: 'width' | 'height' | 'depth';
      readonly to: number;
      readonly policy: EnumOf<'SetDimensionPolicy'>;
    })
  /**
   * Move to a target's position, or a point; the stage works out the distance at `start`. A
   * `smooth` path curves in and out, as Alice's does; the default is a straight line.
   */
  | (Timed & {
      readonly kind: 'moveTo';
      readonly target: Target | Vec3;
      readonly pathStyle?: EnumOf<'PathStyle'>;
    })
  /** Move `amount` metres straight towards a target (away from it if negative); worked out at `start`. */
  | (Timed & { readonly kind: 'moveToward'; readonly target: Target; readonly amount: number })
  /**
   * Take on a target's position and orientation. With `goodView`, the camera instead moves to
   * a place that shows the target well (Alice's `moveAndOrientToAGoodVantagePointOf`).
   */
  | (Timed & {
      readonly kind: 'moveAndOrientTo';
      readonly target: Target;
      readonly goodView?: boolean;
      readonly pathStyle?: EnumOf<'PathStyle'>;
    })
  /** Move beside a target, by both objects' boxes, leaving `gap` metres; worked out at `start`. */
  | (Timed & {
      readonly kind: 'place';
      readonly relation: EnumOf<'SpatialRelation'>;
      readonly target: Target;
      readonly gap: number;
      readonly pathStyle?: EnumOf<'PathStyle'>;
    })
  /** Turn to face a target; worked out at `start`. */
  | (Timed & { readonly kind: 'turnToFace'; readonly target: Target })
  /** Turn to an orientation; worked out at `start`. `up` is the scene unless it says otherwise. */
  | (Timed & { readonly kind: 'orient'; readonly to: Orientation; readonly up?: Target })
  /** Turn one joint, in turns, about an axis in the joint's own space. */
  | (Timed & {
      readonly kind: 'joint';
      readonly joint: JointName;
      readonly axis: Vec3;
      readonly turns: number;
    })
  /** Put every joint back as the model has it, or fold or spread a flyer's wings. */
  | (Timed & {
      readonly kind: 'pose';
      readonly pose: 'straight' | 'wingsFolded' | 'wingsSpread';
    })
  /** Fade to an opacity, 0 to 1. */
  | (Timed & { readonly kind: 'opacity'; readonly to: number })
  /** Change paint, blending from the old one over the duration, as Alice does. */
  | (Timed & { readonly kind: 'paint'; readonly paint: string })
  /** Change a billboard's back paint, blending as `paint` does. */
  | (Timed & { readonly kind: 'backPaint'; readonly paint: string })
  /** Change a 3D text model's words (instant). */
  | (Timed & { readonly kind: 'text'; readonly text: string })
  /** Show a speech or thought bubble for the duration. Without `look`, Alice's defaults. */
  | (Timed & {
      readonly kind: 'say';
      readonly text: string;
      readonly bubble: 'say' | 'think';
      readonly look?: BubbleLook;
    })
  /** Ride on another object, or on the scene again (instant). */
  | (Timed & { readonly kind: 'vehicle'; readonly vehicle: ObjectId | null })
  /** The camera frames its targets with a shot type (WP4.10); `object` is the camera. */
  | (Timed & {
      readonly kind: 'shot';
      readonly shot: ShotType;
      readonly targets: readonly Target[];
    })
  /** The camera's vertical viewing angle, in turns, as Alice gives it; `object` is the camera. */
  | (Timed & { readonly kind: 'lens'; readonly verticalAngle: number })
  /** The sky's colour, which fog fades to (Alice's atmosphere colour); `object` is `SCENE`. */
  | (Timed & { readonly kind: 'atmosphere'; readonly colour: string })
  /** The colour of the light from above or from below; `object` is `SCENE`. */
  | (Timed & { readonly kind: 'light'; readonly from: 'above' | 'below'; readonly colour: string })
  /** Fog, 0 (none) to 1 (thick), as in `SceneSetup`; `object` is `SCENE`. */
  | (Timed & { readonly kind: 'fog'; readonly density: number })
  /**
   * Fades the whole picture towards black: 0 is clear and 1 is black; `object` is `SCENE`.
   * Loading a scene clears it. Going to another scene, and crossfading to one, are the
   * production's (WP8.3), not the stage's.
   */
  | (Timed & { readonly kind: 'fade'; readonly to: number });

export type StageCommandKind = StageCommand['kind'];

/** Questions a running program can ask (the Story API's functions). Answered on the main thread. */
export type StageQuery =
  | { readonly kind: 'transform'; readonly object: Target; readonly at: Micros }
  | {
      readonly kind: 'distance';
      readonly from: Target;
      readonly to: Target;
      readonly at: Micros;
    }
  | {
      readonly kind: 'isColliding';
      readonly a: ObjectId;
      readonly b: ObjectId;
      readonly at: Micros;
    }
  | { readonly kind: 'isVisible'; readonly object: ObjectId; readonly at: Micros }
  /** Width (x), height (y) and depth (z) in metres, in its own axes, as it is now. */
  | { readonly kind: 'size'; readonly object: Target; readonly at: Micros }
  | { readonly kind: 'look'; readonly object: ObjectId; readonly at: Micros }
  | { readonly kind: 'vehicle'; readonly object: ObjectId; readonly at: Micros }
  | { readonly kind: 'sceneLook'; readonly at: Micros }
  /** The camera's vertical viewing angle, in turns. */
  | { readonly kind: 'lens'; readonly at: Micros };

/** How a model looks. A paint the model was made with, not one set since, is `null`. */
export interface Look {
  readonly paint: string | null;
  readonly opacity: number;
  /** A billboard's back paint. */
  readonly backPaint: string | null;
  /** A 3D text model's words. */
  readonly text: string | null;
}

/** The sky, light and fog. Colours are `#rrggbb`. */
export interface SceneLook {
  readonly atmosphere: string;
  readonly fromAbove: string;
  readonly fromBelow: string;
  readonly fog: number;
}

export type StageQueryResult =
  | { readonly kind: 'transform'; readonly value: Transform }
  | { readonly kind: 'distance' | 'lens'; readonly value: number }
  | { readonly kind: 'isColliding' | 'isVisible'; readonly value: boolean }
  | { readonly kind: 'size'; readonly value: Vec3 }
  | { readonly kind: 'look'; readonly value: Look }
  | { readonly kind: 'vehicle'; readonly value: ObjectId | null }
  | { readonly kind: 'sceneLook'; readonly value: SceneLook };

/**
 * What a program wants the stage to keep an eye on, from its listeners. Collisions and keys
 * need nothing: the stage always reports them. Proximity needs its distance, and view events
 * cost something on every frame (decision 0051), so the stage tests only what's asked for.
 */
export type Watch =
  | {
      readonly kind: 'proximity';
      readonly a: readonly ObjectId[];
      readonly b: readonly ObjectId[];
      readonly distance: number;
    }
  | { readonly kind: 'view'; readonly objects: readonly ObjectId[] };

/** What the stage and the learner do that a program's events listen for (WP6.2). */
export type StageEvent =
  /**
   * A click on the picture. `x` and `y` are fractions of it, from its left and its bottom edge,
   * as Alice gives them, so they don't depend on the window's size.
   */
  | {
      readonly kind: 'click';
      readonly object: ObjectId | null;
      readonly x: number;
      readonly y: number;
      readonly at: Micros;
    }
  | { readonly kind: 'key'; readonly key: string; readonly at: Micros }
  /** A key let go, for `heldKeyPolicy`. */
  | { readonly kind: 'keyRelease'; readonly key: string; readonly at: Micros }
  | {
      readonly kind: 'collisionStart' | 'collisionEnd';
      readonly a: ObjectId;
      readonly b: ObjectId;
      readonly at: Micros;
    }
  /** For a `proximity` watch: `a` and `b` came within, or went beyond, its `distance`. */
  | {
      readonly kind: 'proximityEnter' | 'proximityExit';
      readonly a: ObjectId;
      readonly b: ObjectId;
      readonly distance: number;
      readonly at: Micros;
    }
  /** For a `view` watch: an object came into, or left, the camera's picture. */
  | {
      readonly kind: 'viewEnter' | 'viewExit';
      readonly object: ObjectId;
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
