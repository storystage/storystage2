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
  BackstageId,
  JointName,
  Micros,
  ObjectId,
  Quat,
  SceneSetup,
  StageCommand,
  StageEvent,
  StageQuery,
  StageQueryResult,
  Transform,
  Vec3,
  Watch,
} from '@storystage/story-api';

export interface Speech {
  readonly text: string;
  /** A `caption` is a speak line's, which the studio draws and voices (spec 06 section 4.7). */
  readonly bubble: 'say' | 'think' | 'caption';
  /** The script line a caption speaks, if it came from one (the production's `LineId`). */
  readonly line?: string;
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

/**
 * Something a scene names that the stage couldn't find (spec 03 sections 1.3 and 2.2): a model,
 * which shows as a stand-in labelled with its name; a backdrop's ground, sky or lighting, which
 * is the default instead; or a posed joint the loaded model hasn't got, which is left out (never
 * reported for an object shown as a stand-in). The scene still loads and plays.
 */
export type Missing =
  | { readonly kind: 'model'; readonly object: ObjectId; readonly model: BackstageId }
  | { readonly kind: 'backdrop'; readonly id: BackstageId }
  | { readonly kind: 'joint'; readonly object: ObjectId; readonly joint: JointName };

export interface Stage {
  /**
   * Replaces the scene with `setup` and forgets every command. Resolves when every model has
   * loaded **and the scene is ready to draw** (shaders compiled), so the first frame is the same
   * every time (spike 1.4, rule 5). A model or backdrop it can't find doesn't stop it: a model
   * shows as a stand-in, a backdrop's part is the default, and `missing()` says which (spec 03,
   * section 1.3). Rejects with a `StageError` (`bad_argument`) for a set-up it can't make sense of.
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

  /**
   * What the last `load` couldn't find, in set-up order: the backdrop's parts, then each object's
   * model, or the posed joints its model hasn't got.
   */
  missing(): readonly Missing[];

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

/** What the scene view can choose and move: an object (the camera included) or a marker. */
export type EditTarget = { readonly object: ObjectId } | { readonly marker: string };

/**
 * One step of Look around's camera, for the scene view's buttons (owner, 24 Nov; 07-ux section
 * 7.2). Each is the same size as its key: circling and tilting a 24th of a turn (arrows),
 * zooming 1.25 times nearer or further (+ and -), and panning a sixth of the way to what it
 * looks at (Shift and an arrow).
 * - `circleLeft`, `circleRight`: the camera goes round what it looks at, to its left or right.
 * - `riseAndLookDown`, `dropAndLookUp`: it tilts round what it looks at.
 * - `zoomIn`, `zoomOut`: nearer to it or further away.
 * - `panLeft`, `panRight`, `panUp`, `panDown`: it slides without turning, so the scene moves the
 *   other way in the picture.
 */
export type ViewStep =
  | 'circleLeft'
  | 'circleRight'
  | 'riseAndLookDown'
  | 'dropAndLookUp'
  | 'zoomIn'
  | 'zoomOut'
  | 'panLeft'
  | 'panRight'
  | 'panUp'
  | 'panDown';

/** A hand or foot a character can be posed by (5.9, decision 0073). */
export type PoseHandle = 'leftHand' | 'rightHand' | 'leftFoot' | 'rightFoot';

/** A pose handle dragged: live while it moves, then once more with `final` when it's let go. */
export interface PoseEvent {
  readonly object: ObjectId;
  readonly handle: PoseHandle;
  /** Its whole pose, as `ObjectChange.joints` and `SceneObjectSetup.joints` have it. */
  readonly joints: { readonly [joint: JointName]: Quat };
  readonly final: boolean;
}

/** What's at a point of the view. */
export interface Picked {
  /** The object or marker there, nearest first; null for the ground, the sky or nothing. */
  readonly target: EditTarget | null;
  /** Where the point meets the ground (y = 0, or a room's floor) within 256 m; null above it. */
  readonly ground: Vec3 | null;
  /**
   * The pose handle there, while `showPoseHandles` shows them (its object is `target`): a tap on
   * one reports it, so the Pose panel can choose that hand's or foot's joint (S5).
   */
  readonly pose?: PoseHandle;
}

/** A handle being dragged: live while it moves, then once more with `final` when it's let go. */
export interface EditEvent {
  readonly target: EditTarget;
  /** The whole transform, relative to the scene, as the set-up has it. */
  readonly transform: Transform;
  readonly final: boolean;
}

/** A change to one object's set-up, made without reloading. Fields left out stay as they are. */
export interface ObjectChange {
  readonly transform?: Transform;
  /** 0 to 1. */
  readonly opacity?: number;
  /** A paint name or `#rrggbb`. */
  readonly paint?: string;
  /**
   * Its whole pose, which replaces the set-up's: each joint's turn from rest, as
   * `SceneObjectSetup.joints` has it. Refused for a joint the object doesn't have (`joints`).
   */
  readonly joints?: { readonly [joint: JointName]: Quat };
}

/**
 * The scene view's stage (07-ux section 7.2, agreed with S5): choosing, moving and looking round
 * a scene's set-up. The Babylon.js stage is one, and `FakeStage` is one for tests. The runtime,
 * export and the self-test use `Stage` alone. Points of the view are CSS pixels from the
 * canvas's top left.
 *
 * A `load` keeps the scene view as it was (S5's ask): edit mode, what's chosen while it's still
 * in the scene, and Look around's camera. The studio loads the set-up again after each change it
 * writes, so a drag's object stays chosen without choosing it again.
 */
export interface EditableStage extends Stage {
  /**
   * Edit mode. On, the scene goes back to its set-up (as `reset` does) and the chosen object's
   * outline and handles, and the markers, are drawn; taps are reported. Off for Rehearse and for
   * playing in Camera view. Handles and markers are drawn on the live canvas only, never in
   * `renderFrame` or `picture`.
   */
  editing(on: boolean): void;

  /**
   * What's at a point of the view: the object (or, while editing, the marker) there, and where it
   * meets the ground. For a drop from Backstage. Picking is by ray, against what's drawn.
   */
  pick(x: number, y: number): Picked;

  /**
   * Chooses what has the amber outline and handles: move along the ground (with Shift, up and
   * down), turn about the vertical, and resize evenly. Null chooses nothing. Throws a
   * `StageError` (`unknown_object`) for something that isn't in the scene.
   */
  choose(target: EditTarget | null): void;

  /** Listens for handle drags. Returns a function that stops listening. */
  onEdit(listener: (event: EditEvent) => void): () => void;

  /**
   * Listens for a click or tap on the view while editing that didn't start a handle drag, with
   * what was there, as `pick` gives it. Returns a function that stops listening.
   */
  onTap(listener: (picked: Picked) => void): () => void;

  /**
   * Drag posing (5.9, decision 0073): the hands and feet an object can be posed by, those whose
   * arm or leg has all three joints (upper, lower and the hand or foot). Empty for a prop or a
   * stand-in.
   */
  poseHandles(object: ObjectId): readonly PoseHandle[];

  /**
   * The joints a pose handle turns, and the hand or foot itself: [upper, lower, end] (an upper
   * arm, a lower arm and a hand). A drag's `joints` differ from the set-up's only in the first
   * two. Throws `unknown_joint` for one the object can't be posed by.
   */
  poseHandleJoints(object: ObjectId, handle: PoseHandle): readonly JointName[];

  /**
   * Shows an object's pose handles (`poseHandles`) while editing, for the Pose panel, or none
   * with null; its move, turn and resize handles hide meanwhile. Dragging one bends its arm or
   * leg so the hand or foot follows the pointer, in the plane facing the view, by inverse
   * kinematics: joints only turn (0051), the shoulder or hip stays put, an elbow bends out and
   * back and a knee forwards, and past its reach the limb points at the pointer. It's reported
   * to `onPose`, and the set-up follows it at once, as an object handle's drag does. A press on
   * one that never moves is a tap, reported to `onTap` with `Picked.pose`. Each is a small amber
   * ball edged in ink, taken hold of within 22 CSS px (a 44 px target), drawn as the object
   * handles are: on the live canvas only, never in a frame. Throws `unknown_object` for
   * something not in the scene.
   *
   * A pose's turns are any turn from rest, so each reads back within the Pose panel's fields
   * (heading and roll within half a turn, tilt within a quarter) without being clamped.
   */
  showPoseHandles(object: ObjectId | null): void;

  /** A pose handle's drag, live and then `final` when it's let go: the studio writes the final. */
  onPose(listener: (event: PoseEvent) => void): () => void;

  /**
   * Esc: ends a drag in progress, a pose handle's or an object handle's, and puts what it moved
   * back as it was when the drag began. It reports nothing. True if there was a drag to put back;
   * false, and nothing happens, without one, so the studio can use the Esc for something else.
   */
  cancelDrag(): boolean;

  /**
   * For the keyboard: where a pose handle (the hand or foot itself) is in the scene now. Throws
   * `unknown_joint` for one the object can't be posed by.
   */
  handlePlace(object: ObjectId, handle: PoseHandle): Vec3;

  /**
   * For the keyboard: the object's whole pose with that arm or leg bent so the hand or foot
   * reaches `target` (a point in the scene), as a drag to it would. It changes nothing: the studio
   * writes it, as one undo step, with `setObject`. Throws as `handlePlace` does.
   */
  posedReaching(
    object: ObjectId,
    handle: PoseHandle,
    target: Vec3,
  ): { readonly [joint: JointName]: Quat };

  /**
   * Changes one object's set-up, or the camera's (`CAMERA`, its transform only), without
   * reloading. Scheduled commands stay, and the scene is shown again at its time. Everything that
   * asks about the scene, `inShot` included, answers for the change at once. Throws a
   * `StageError` (`unknown_object`, `bad_argument`) and changes nothing if the change can't be
   * made.
   */
  setObject(object: ObjectId, change: ObjectChange): void;

  /** Moves a marker in the set-up, as `setObject` moves an object. */
  setMarker(id: string, transform: Transform): void;

  /**
   * Look around: on, the view is an orbit camera of its own (the pointer, touch, and the arrow
   * keys while the canvas has focus), starting where the scene's camera is; it never changes the
   * set-up. Dragging circles and tilts it; a Shift-drag, a right-drag or a two-finger drag pans
   * it; the wheel or a pinch zooms. Off is Camera view again. It never takes focus.
   */
  lookAround(on: boolean): void;

  /**
   * Moves Look around's camera one step (`ViewStep`), as its key does; the scene view's buttons
   * call it. False, and nothing moves, while Look around is off.
   */
  viewStep(step: ViewStep): boolean;

  /**
   * Where one step (`ViewStep`) would put the scene's own camera, for the scene view's buttons in
   * Camera view (owner, 24 Nov): moved as the same step moves Look around's camera, round the
   * same point (as far ahead as what's in its shot, or where its line of sight meets the ground,
   * or a few metres ahead). It changes nothing: the studio writes it, as one undo step, with
   * `setObject`. The camera keeps its size. Zooming and panning keep its turn, roll and all;
   * circling and tilting straighten a roll, as Look around has none.
   *
   * `around` is the point to turn round, as the last step gave it back: the studio carries it
   * through steps one after another, so a held Circle round keeps going round the same point when
   * something leaves the shot (S5, 24 Nov). Without it, or if it's behind the camera, the point
   * is found again. It gives back the point it used, moved with the camera by a pan.
   */
  steppedCamera(step: ViewStep, around?: Vec3): { transform: Transform; around: Vec3 };

  /** Where the view is: Look around's camera while it's on, otherwise the scene's camera. */
  viewTransform(): Transform;

  /**
   * The objects the scene's camera sees (not Look around's), in set-up order, the camera not
   * among them: anything with some part of its box in view, nearer than 256 m and not faded to
   * nothing. For "In this shot:".
   */
  inShot(): readonly ObjectId[];
}
