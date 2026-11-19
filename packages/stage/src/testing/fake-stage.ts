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
  type SceneSetup,
  type StageCommand,
  type StageEvent,
  type StageQuery,
  type StageQueryResult,
  type StoryClass,
  type Transform,
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
  Speech,
} from '../contract.ts';
import { MARKER_BOX, boxPoints, groundPoint, inViewOf, rayHitsBox, viewRay } from '../editing.ts';
import type { Box } from '../hull.ts';
import { length, sub, v } from '../math.ts';
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
    return this.lost;
  }

  /** Records preloading; there's nothing to get ready. */
  async preload(setup: SceneSetup): Promise<void> {
    this.record('preload', [setup]);
  }

  /** A crossfade is recorded; the fake stage draws nothing, so the old scene simply goes. */
  /** Loads may overlap: the newest call wins, and an older one settles without taking over. */
  async load(setup: SceneSetup, options?: LoadOptions): Promise<void> {
    this.record('load', options ? [setup, options] : [setup]);
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
