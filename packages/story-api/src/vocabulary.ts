/**
 * WP0.8 contract: time, space, names and styles shared by every package that talks about a scene.
 * Changing anything here is a `contract` pull request reviewed by S6 (owner) and S3 (stage).
 */

// ---- Time ------------------------------------------------------------------------------------

/**
 * Scene time in whole microseconds. Integer time means sums of durations never drift, so runs
 * repeat exactly (spike 1.4, rule 3).
 */
export type Micros = number;
export const MICROS_PER_SECOND = 1_000_000;
/** Seconds to scene time, rounded to the microsecond. */
export const micros = (seconds: number): Micros => Math.round(seconds * MICROS_PER_SECOND);
/** Alice's default duration for a procedure: one second (WP4.3). */
export const DEFAULT_DURATION: Micros = MICROS_PER_SECOND;

// ---- Space -----------------------------------------------------------------------------------

/** Metres. glTF conventions: right-handed, Y up, a model faces +Z. */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
/** A unit quaternion. */
export interface Quat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}
export interface Transform {
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly scale: Vec3;
}
export const IDENTITY: Transform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
};

// ---- Names -----------------------------------------------------------------------------------

/** An object in a scene, by the name the learner sees in code ("cat", "camera"). */
export type ObjectId = string & { readonly __objectId: true };
/** A model in `backstage.json` (WP3.4), for example `Quadruped/Cat/AbyssinianCat`. */
export type BackstageId = string & { readonly __backstageId: true };
/** A joint from the joint map (WP3.3, `docs/spec/10-crosswalk.md`), for example `head`. */
export type JointName = string & { readonly __jointName: true };

export const objectId = (s: string) => s as ObjectId;
/** The camera is an object like any other in commands and queries, under this name. */
export const CAMERA = 'camera' as ObjectId;
export const backstageId = (s: string) => s as BackstageId;
export const jointName = (s: string) => s as JointName;

/** The Story API classes (WP4.1), Alice's names without the `S` prefix. */
export const STORY_CLASSES = [
  'Scene',
  'Camera',
  'Biped',
  'Quadruped',
  'Flyer',
  'Swimmer',
  'Slitherer',
  'Prop',
  'Transport',
  'Ground',
  'Billboard',
  'Text',
] as const;
export type StoryClass = (typeof STORY_CLASSES)[number];

// ---- Styles ----------------------------------------------------------------------------------

/** Alice's animation styles. The default is `beginAndEndGently`. */
export const ANIMATION_STYLES = [
  'beginAndEndGently',
  'beginGentlyAndEndAbruptly',
  'beginAbruptlyAndEndGently',
  'beginAndEndAbruptly',
] as const;
export type AnimationStyle = (typeof ANIMATION_STYLES)[number];

/**
 * How far through an animation of the given style we are, for progress `p` from 0 to 1.
 * The runtime, the stage and the fake stage all use this one function, so they agree exactly.
 */
export function ease(style: AnimationStyle, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  switch (style) {
    case 'beginAndEndGently':
      return p * p * (3 - 2 * p);
    case 'beginGentlyAndEndAbruptly':
      return p * p;
    case 'beginAbruptlyAndEndGently':
      return 1 - (1 - p) * (1 - p);
    case 'beginAndEndAbruptly':
      return p;
  }
}

/** Shot types for smart-camera blocks and storyboard frames (WP4.10, WP10.6). */
export const SHOT_TYPES = [
  'wide',
  'medium',
  'closeUp',
  'overTheShoulder',
  'follow',
  'twoShot',
] as const;
export type ShotType = (typeof SHOT_TYPES)[number];

// ---- What a scene starts with ----------------------------------------------------------------

/** A labelled outline standing in for a model that isn't in Backstage yet (WP10.9). */
export interface StandIn {
  readonly standIn: string;
}

export interface SceneObjectSetup {
  readonly id: ObjectId;
  readonly model: BackstageId | StandIn;
  readonly class: StoryClass;
  readonly transform: Transform;
  /** 0 (invisible) to 1. Default 1. */
  readonly opacity?: number;
  /** A paint name from the Story API's list, or a `#rrggbb` colour. */
  readonly paint?: string;
  /** The object this one rides on (Alice's vehicle). Default: the scene. */
  readonly vehicle?: ObjectId | null;
}

export interface SceneSetup {
  /** Backstage's Backdrops section: ground, sky, lighting and fog. */
  readonly backdrop: {
    readonly ground?: BackstageId;
    readonly sky?: BackstageId;
    readonly lighting?: BackstageId;
    /** 0 (none) to 1 (thick). */
    readonly fog?: number;
  };
  readonly objects: readonly SceneObjectSetup[];
  readonly camera: { readonly transform: Transform; readonly fieldOfViewDegrees?: number };
  /** Camera and object markers (WP5.4). */
  readonly markers: readonly { readonly id: string; readonly transform: Transform }[];
}
