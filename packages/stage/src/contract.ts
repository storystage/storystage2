/**
 * WP0.8 contract: the stage interface. The runtime bridge, the Story API, the studio, export and
 * the self-test talk to the 3D stage only through this, never to Babylon.js directly (WP5.1).
 *
 * Owner: S3. A change here is a `contract` pull request, reviewed before the code that uses it.
 * Every implementation (the Babylon.js stage and `FakeStage`) passes `describeStageContract`.
 *
 * How time works (spike 1.4): commands are scheduled ahead of time with start times on the
 * scene clock, and `seek(t)` puts the scene into its state at `t`. That state is a pure function
 * of the setup and the commands scheduled so far, so live play, fixed-step export and tests all
 * see the same scene at the same time.
 */
import type {
  JointName,
  Micros,
  ObjectId,
  SceneSetup,
  StageCommand,
  StageEvent,
  StageQuery,
  StageQueryResult,
  Transform,
  Watch,
} from '@storystage/story-api';

export interface Speech {
  readonly text: string;
  readonly bubble: 'say' | 'think';
}

/** A rendered frame, RGBA, top row first. */
export interface FrameImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** How a scene replaces the one before (WP8.3, spec 03 section 3.1). */
export interface LoadOptions {
  /**
   * Crossfade from the scene before over this much of the new scene's time, in microseconds:
   * the old scene is drawn over the new one, fading out. It keeps moving, as if its clock went on,
   * except that a stage drawing at "low" quality, live, may hold it still; an export always
   * shows it moving. It fires no events and answers nothing. With no scene before, there's
   * nothing to fade.
   */
  readonly crossfade?: Micros;
}

export interface Stage {
  /**
   * Replaces the scene with `setup` and forgets every command. Resolves when every model has
   * loaded **and the scene is ready to draw** (shaders compiled), so the first frame is the same
   * every time (spike 1.4, rule 5). Rejects with a `StageError` (`unknown_model`).
   */
  load(setup: SceneSetup, options?: LoadOptions): Promise<void>;

  /**
   * WP8.2: gets a scene that will probably come next ready to load, while this one plays: its
   * models are fetched and read, and nothing changes on screen or in this scene. The `load`
   * that follows uses what's ready, whether or not it's this scene, so a scene that shares
   * models with it loads faster too. Never rejects; a model that can't be had is `load`'s to
   * report.
   */
  preload(setup: SceneSetup): Promise<void>;

  /** The objects in the scene, the camera included, in setup order. */
  objects(): readonly ObjectId[];

  /** The joints an object has (empty for props), from its Backstage entry. */
  joints(object: ObjectId): readonly JointName[];

  /**
   * Adds commands. They may arrive in any order and before their start time. Throws a
   * `StageError` (`unknown_object`, `unknown_joint`, `bad_argument`) and adds none of them if
   * any one is invalid.
   */
  schedule(commands: readonly StageCommand[]): void;

  /** Forgets every command: the scene goes back to its setup (Rehearse's restart). */
  reset(): void;

  /** Puts the scene into its state at time `t`. Pure: seeking back and forth gives the same scene. */
  seek(t: Micros): void;

  /** The scene time of the last `seek`. */
  time(): Micros;

  /** An object's transform after the last `seek`, relative to the scene. */
  transform(object: ObjectId): Transform;

  /** What an object is saying after the last `seek`, if anything. */
  speech(object: ObjectId): Speech | null;

  /** Answers a question at `query.at`, without moving the scene from its last `seek`. */
  answer(query: StageQuery): StageQueryResult;

  /** Listens for clicks, keys, collisions and proximity. Returns a function that stops listening. */
  onEvent(listener: (event: StageEvent) => void): () => void;

  /**
   * What to keep an eye on for proximity and view events, from the program's listeners. Each
   * call replaces the last; `load` forgets them. Nothing fires for a pair or an object that's
   * already within reach or in view when watching starts.
   */
  watch(watches: readonly Watch[]): void;

  /**
   * A hash of every object's transform, joints, opacity, paint, speech and vehicle after the
   * last `seek`, rounded to a micrometre. Equal scenes give equal hashes on every renderer
   * (determinism checks, WP18.2).
   */
  stateHash(): number;

  /** Draws the scene as it is after the last `seek`. Used offscreen for export (WP11.3). */
  renderFrame(): Promise<FrameImage>;

  /**
   * A picture of the scene as it is at time `at`, `width` × `height` pixels (up to 4096 each
   * way), for the Screening room's compare with the storyboard (WP5.7, WP11.6). It leaves the
   * scene where its last `seek` put it, and fires no events. Pictures never go to the Prompter
   * (CLAUDE.md rule 3). Rejects with `bad_argument` for a size it can't draw.
   */
  picture(at: Micros, width: number, height: number): Promise<FrameImage>;

  dispose(): void;
}
