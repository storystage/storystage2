/**
 * A stage with no graphics, for tests and for lanes that run before the real stage exists
 * (WP0.8). It works the scene out with the same `Timeline` as the real stage, records every call
 * made to it, and lets a test fire stage events.
 *
 * Approximations, listed so tests don't rely on them: collisions are "closer than 0.5 m"; every
 * object has a stand-in's size; the camera's shot is recorded, not framed; the rendered frame is a
 * few bytes derived from the state hash. As the scene view's stage it picks by the same rays as the
 * real stage, against those sizes; a marker is a 30 cm box; it has no handles, so a test drags
 * with `drag`, taps with `tap` and moves Look around's camera with `moveView`.
 */
import {
  CAMERA,
  StageError,
  type BackstageId,
  type JointName,
  type Micros,
  type ObjectId,
  type Quat,
  type SceneSetup,
  type StageCommand,
  type StageEvent,
  type StageQuery,
  type StageQueryResult,
  type StoryClass,
  type Transform,
  type Vec3,
  type Watch,
  jointName,
} from '@storystage/story-api';
import type {
  EditEvent,
  EditTarget,
  EditableStage,
  FrameImage,
  LoadOptions,
  Missing,
  ObjectChange,
  Picked,
  PoseEvent,
  PoseHandle,
  Speech,
  ViewStep,
} from '../contract.ts';
import { reachTurns } from '../ik.ts';
import { POSE_HANDLES, limbOf, poleFor } from '../posing.ts';
import { MARKER_BOX, boxPoints, groundPoint, inViewOf, rayHitsBox, viewRay } from '../editing.ts';
import type { Box } from '../hull.ts';
import { conjugate, length, mul, sub, v } from '../math.ts';
import { orbitFrom, orbitStep, orbitView, stepCamera } from '../orbit.ts';
import { checkPictureSize } from '../picture.ts';
import { Timeline, hashState, standInShape, type Touching } from '../timeline.ts';
import { humanoidsFor } from '../humanoid/library.ts';
import { resolveBackdropKnown } from '../backdrops.ts';
import { inOrder } from '../missing.ts';

export { hashState };

export interface FakeStageCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

export interface FakeStageOptions {
  /** If given, `load` refuses models not in this list (stand-ins are always fine). */
  readonly knownModels?: readonly BackstageId[];
  /** The joints each object has. Default: `head` and `neck` for anything that can act, none for the rest. */
  readonly jointsFor?: (
    cls: StoryClass,
    model: SceneSetup['objects'][number]['model'],
  ) => readonly JointName[];
  /** The view's size in pixels, for `pick`, `tap` and `inShot`. Default 640 by 360. */
  readonly view?: { readonly width: number; readonly height: number };
}

const ACTORS: readonly StoryClass[] = ['Biped', 'Quadruped', 'Flyer', 'Swimmer', 'Slitherer'];
const defaultJoints: NonNullable<FakeStageOptions['jointsFor']> = (cls) =>
  ACTORS.includes(cls) ? [jointName('head'), jointName('neck')] : [];

const closeBy: Touching = (a, b) => length(sub(a.transform.position, b.transform.position)) < 0.5;

export class FakeStage implements EditableStage {
  readonly calls: FakeStageCall[] = [];
  private readonly timeline = new Timeline();
  /** What the last `load` couldn't find. */
  private lost: readonly Missing[] = [];
  private listeners = new Set<(e: StageEvent) => void>();
  private readonly options: FakeStageOptions;
  private isEditing = false;
  /** How many loads have been asked for: the newest wins. */
  private loads = 0;
  private chosenTarget: EditTarget | null = null;
  private readonly poseListeners = new Set<(e: PoseEvent) => void>();
  private posing: ObjectId | null = null;
  /** A live `dragPose`'s object and its pose before the drag, for `cancelDrag`. */
  private dragging: { object: ObjectId; start: { readonly [joint: JointName]: Quat } } | null =
    null;
  /** The last `posedReaching` for each object and handle: its target and the pose it gave. */
  private readonly reached = new Map<
    string,
    { target: Vec3; joints: { readonly [joint: JointName]: Quat } }
  >();
  /** Look around's camera while it's on. */
  private around: Transform | null = null;
  private editListeners = new Set<(e: EditEvent) => void>();
  private tapListeners = new Set<(p: Picked) => void>();

  constructor(options: FakeStageOptions = {}) {
    this.options = options;
  }

  private record(method: string, args: unknown[]) {
    this.calls.push({ method, args: structuredClone(args) });
  }

  missing(): readonly Missing[] {
    return [...this.lost, ...this.timeline.missingSounds()];
  }

  /** Records preloading; there's nothing to get ready. */
  async preload(setup: SceneSetup): Promise<void> {
    this.record('preload', [setup]);
  }

  /** A crossfade is recorded; the fake stage draws nothing, so the old scene simply goes. */
  /** Loads may overlap: the newest call wins, and an older one settles without taking over. */
  async load(setup: SceneSetup, options?: LoadOptions): Promise<void> {
    this.record('load', options ? [setup, options] : [setup]);
    this.dragging = null;
    const ticket = ++this.loads;
    // What it can't find shows as a stand-in, and the scene plays on (spec 03 section 1.3).
    const known = this.options.knownModels;
    const resolved = resolveBackdropKnown(setup.backdrop);
    const lost: Missing[] = resolved.missing.map((id) => ({ kind: 'backdrop', id }));
    // A picture sky is a Backstage item; a ground's texture is optional (spec 17 section 2).
    const { sky, ids } = resolved.backdrop;
    if (known && sky.picture && ids.sky && !known.includes(ids.sky))
      lost.push({ kind: 'backdrop', id: ids.sky });
    for (const o of setup.objects)
      if (known && typeof o.model === 'string' && !known.includes(o.model))
        lost.push({ kind: 'model', object: o.id, model: o.model });
    const jointsFor = this.options.jointsFor ?? defaultJoints;
    // Every object is the size of a stand-in, so the fake and the real stage agree on them.
    this.timeline.load(setup, (o) =>
      standInShape(
        jointsFor(o.class, o.model),
        typeof o.model === 'string' ? undefined : o.model.size,
      ),
    );
    this.lost = inOrder(setup, lost, (id) => this.timeline.joints(id));
    const humanoids = await humanoidsFor(setup);
    // A newer load has its own timeline by now; this one leaves it alone.
    if (ticket !== this.loads) return;
    this.timeline.useHumanoids(humanoids.library, humanoids.navigation);
    // The scene view stays as it was: edit mode, what's chosen if it's still here, Look around.
    if (this.isEditing) this.timeline.reset();
    const chosen = this.chosenTarget;
    if (chosen && !this.has(chosen)) this.chosenTarget = null;
  }

  objects(): readonly ObjectId[] {
    return this.timeline.objects();
  }

  joints(object: ObjectId): readonly JointName[] {
    return this.timeline.joints(object);
  }

  schedule(commands: readonly StageCommand[]): void {
    this.record('schedule', [commands]);
    this.timeline.schedule(commands);
  }

  reset(): void {
    this.record('reset', []);
    this.timeline.reset();
  }

  seek(t: Micros): void {
    this.record('seek', [t]);
    this.timeline.seek(t);
  }

  time(): Micros {
    return this.timeline.time();
  }

  transform(object: ObjectId): Transform {
    return this.timeline.transform(object);
  }

  speech(object: ObjectId): Speech | null {
    return this.timeline.speech(object);
  }

  answer(query: StageQuery): StageQueryResult {
    this.record('answer', [query]);
    return this.timeline.answer(query, closeBy);
  }

  onEvent(listener: (event: StageEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Recorded only: a test fires proximity and view events itself, with `emit`. */
  watch(watches: readonly Watch[]): void {
    this.record('watch', [watches]);
  }

  /** Test helper: fire a stage event, as a click or a collision would. */
  emit(event: StageEvent): void {
    for (const l of [...this.listeners]) l(event);
  }

  stateHash(): number {
    return this.timeline.stateHash();
  }

  async renderFrame(): Promise<FrameImage> {
    this.record('renderFrame', []);
    return hashPicture(this.stateHash(), 1, 1);
  }

  /** Every pixel is the colour of the scene's hash at `at`, so equal scenes give equal pictures. */
  async picture(at: Micros, width: number, height: number): Promise<FrameImage> {
    this.record('picture', [at, width, height]);
    checkPictureSize(width, height);
    const now = this.timeline.time();
    this.timeline.seek(at);
    const h = this.timeline.stateHash();
    this.timeline.seek(now);
    return hashPicture(h, width, height);
  }

  dispose(): void {
    this.record('dispose', []);
    this.listeners.clear();
    this.editListeners.clear();
    this.tapListeners.clear();
    this.poseListeners.clear();
  }

  editing(on: boolean): void {
    this.record('editing', [on]);
    this.isEditing = on;
    if (on) this.timeline.reset();
  }

  /** Whether edit mode is on, for a test. */
  isEditingNow(): boolean {
    return this.isEditing;
  }

  pick(x: number, y: number): Picked {
    const { width, height } = this.size();
    const ray = viewRay(this.viewTransform(), this.timeline.lens(), width, height, x, y);
    let nearest: { target: EditTarget; distance: number } | null = null;
    const consider = (target: EditTarget, box: Box, t: Transform) => {
      const distance = rayHitsBox(ray, box, t);
      if (distance !== null && (!nearest || distance < nearest.distance))
        nearest = { target, distance };
    };
    for (const object of this.objects()) {
      const box = this.timeline.box(object);
      if (object !== CAMERA && box && this.showing(object))
        consider({ object }, box, this.timeline.transform(object));
    }
    if (this.isEditing)
      for (const [marker, pose] of this.timeline.markerPlaces())
        consider({ marker }, MARKER_BOX, { ...pose, scale: v(1, 1, 1) });
    const found = nearest as { target: EditTarget; distance: number } | null;
    return { target: found?.target ?? null, ground: groundPoint(ray, this.timeline.ground()) };
  }

  choose(target: EditTarget | null): void {
    this.record('choose', [target]);
    if (target && !this.has(target))
      throw new StageError(
        'unknown_object',
        'object' in target
          ? `There is nothing called ${target.object} in this scene.`
          : `There is no marker called ${target.marker} in this scene.`,
      );
    this.chosenTarget = target;
  }

  poseHandles(object: ObjectId): readonly PoseHandle[] {
    if (!this.objects().includes(object)) return [];
    return POSE_HANDLES.filter((handle) => {
      const { root, middle, end } = limbOf(handle);
      return [root, middle, end].every((joint) => this.timeline.restPlace(object, joint));
    });
  }

  showPoseHandles(object: ObjectId | null): void {
    this.record('showPoseHandles', [object]);
    if (object !== null && !this.has({ object }))
      throw new StageError('unknown_object', `There is nothing called ${object} in this scene.`);
    this.posing = object;
  }

  /** The object whose pose handles are shown, for a test. */
  posingNow(): ObjectId | null {
    return this.posing;
  }

  onPose(listener: (event: PoseEvent) => void): () => void {
    this.poseListeners.add(listener);
    return () => this.poseListeners.delete(listener);
  }

  /** Puts back a drag a test began with `dragPose(..., { final: false })`, as the pointer's would be. */
  cancelDrag(): boolean {
    this.record('cancelDrag', []);
    const drag = this.dragging;
    this.dragging = null;
    if (!drag) return false;
    this.timeline.setObject(drag.object, { joints: drag.start });
    return true;
  }

  /**
   * Test helper: a pose handle's drag reported with `joints`, as the pointer's would be, and the
   * set-up following it. Until a `final` one, `cancelDrag` has a drag to put back.
   */
  dragPose(
    object: ObjectId,
    handle: PoseHandle,
    joints: { readonly [joint: JointName]: Quat },
    { final = true }: { final?: boolean } = {},
  ): void {
    // The pose before the first live step, for Esc.
    const start = this.dragging?.object === object ? this.dragging.start : null;
    if (!final) this.dragging = { object, start: start ?? this.timeline.setupJoints(object) };
    else this.dragging = null;
    this.timeline.setObject(object, { joints });
    for (const l of [...this.poseListeners]) l({ object, handle, joints, final });
  }

  poseHandleJoints(object: ObjectId, handle: PoseHandle): readonly JointName[] {
    this.limbPlaces(object, handle);
    const { root, middle, end } = limbOf(handle);
    return [root, middle, end];
  }

  /**
   * The fake doesn't pose its stand-ins, so a hand or foot is where it rests, unless the set-up
   * has the pose the last `posedReaching` for it gave: then it's where that was asked to reach,
   * so keys that step from here add up (S5).
   */
  handlePlace(object: ObjectId, handle: PoseHandle): Vec3 {
    const rest = this.limbPlaces(object, handle).end;
    const last = this.reached.get(`${object} ${handle}`);
    if (!last) return rest;
    const now = this.timeline.setupJoints(object);
    const { root, middle } = limbOf(handle);
    const same = (j: JointName) => JSON.stringify(now[j]) === JSON.stringify(last.joints[j]);
    return same(root) && same(middle) ? last.target : rest;
  }

  /**
   * The fake's pose is approximate: each turn is the solver's, in the object's own axes, as if
   * every joint rested unturned. Enough for the studio's tests to see a pose written.
   */
  posedReaching(
    object: ObjectId,
    handle: PoseHandle,
    target: Vec3,
  ): { readonly [joint: JointName]: Quat } {
    const limb = limbOf(handle);
    const places = this.limbPlaces(object, handle);
    const facing = this.timeline.transform(object).rotation;
    const turns = reachTurns(places, target, poleFor(handle, places, facing));
    const own = (q: Quat) => mul(conjugate(facing), mul(q, facing));
    const joints = {
      ...this.timeline.setupJoints(object),
      [limb.root]: own(turns.root),
      [limb.middle]: own(turns.middle),
    };
    this.reached.set(`${object} ${handle}`, { target, joints });
    return joints;
  }

  private limbPlaces(
    object: ObjectId,
    handle: PoseHandle,
  ): { root: Vec3; middle: Vec3; end: Vec3 } {
    if (!this.objects().includes(object))
      throw new StageError('unknown_object', `There is nothing called ${object} in this scene.`);
    const { root, middle, end } = limbOf(handle);
    const at = [root, middle, end].map((joint) => this.timeline.restPlace(object, joint));
    if (!at[0] || !at[1] || !at[2])
      throw new StageError('unknown_joint', `${object} can't be posed by its ${handle}.`);
    return { root: at[0], middle: at[1], end: at[2] };
  }

  private has(target: EditTarget): boolean {
    return 'object' in target
      ? this.objects().includes(target.object)
      : this.timeline.markerPlaces().has(target.marker);
  }

  /** What's chosen, for a test. */
  chosen(): EditTarget | null {
    return this.chosenTarget;
  }

  onEdit(listener: (event: EditEvent) => void): () => void {
    this.editListeners.add(listener);
    return () => this.editListeners.delete(listener);
  }

  onTap(listener: (picked: Picked) => void): () => void {
    this.tapListeners.add(listener);
    return () => this.tapListeners.delete(listener);
  }

  /** Test helper: a handle drag, as the real stage's handles report one. */
  drag(event: EditEvent): void {
    for (const l of [...this.editListeners]) l(event);
  }

  /** Test helper: a click or tap at (x, y), reported only while editing. */
  tap(x: number, y: number): void {
    if (!this.isEditing) return;
    const picked = this.pick(x, y);
    for (const l of [...this.tapListeners]) l(picked);
  }

  /** Test helper: a tap on a shown pose handle, as the pointer's would be reported. */
  tapPose(object: ObjectId, handle: PoseHandle): void {
    if (!this.isEditing || this.posing !== object) return;
    const ground = null;
    for (const l of [...this.tapListeners]) l({ target: { object }, ground, pose: handle });
  }

  setObject(object: ObjectId, change: ObjectChange): void {
    this.record('setObject', [object, change]);
    this.timeline.setObject(object, change);
  }

  setMarker(id: string, transform: Transform): void {
    this.record('setMarker', [id, transform]);
    this.timeline.setMarker(id, transform);
  }

  lookAround(on: boolean): void {
    this.record('lookAround', [on]);
    this.around = on ? this.timeline.transform(CAMERA) : null;
  }

  /** Test helper: moves Look around's camera, as the pointer or the keys would. */
  moveView(transform: Transform): void {
    if (this.around) this.around = transform;
  }

  viewTransform(): Transform {
    return this.around ?? this.timeline.transform(CAMERA);
  }

  viewStep(step: ViewStep): boolean {
    this.record('viewStep', [step]);
    if (!this.around) return false;
    this.around = orbitView(orbitStep(orbitFrom(this.around, this.timeline.ground()), step));
    return true;
  }

  steppedCamera(step: ViewStep, around?: Vec3): { transform: Transform; around: Vec3 } {
    return stepCamera(this.timeline.transform(CAMERA), this.timeline.ground(), [], step, around);
  }

  inShot(): readonly ObjectId[] {
    const { width, height } = this.size();
    const camera = this.timeline.transform(CAMERA);
    const lens = this.timeline.lens();
    return this.objects().filter((object) => {
      const box = this.timeline.box(object);
      if (object === CAMERA || !box || !this.showing(object)) return false;
      return boxPoints(box, this.timeline.transform(object)).some((p) =>
        inViewOf(camera, lens, width / height, p),
      );
    });
  }

  private size() {
    return this.options.view ?? { width: 640, height: 360 };
  }

  /** Not faded to nothing. */
  private showing(object: ObjectId): boolean {
    const q = { kind: 'isVisible', object, at: this.timeline.time() } as const;
    return this.timeline.answer(q, closeBy).value === true;
  }
}

function hashPicture(h: number, width: number, height: number): FrameImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < data.length; p += 4)
    data.set([h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, 255], p);
  return { width, height, data };
}
