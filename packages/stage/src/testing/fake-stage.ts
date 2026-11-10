/**
 * A stage with no graphics, for tests and for lanes that run before the real stage exists
 * (WP0.8). It works the scene out with the same `Timeline` as the real stage, records every call
 * made to it, and lets a test fire stage events.
 *
 * Approximations, listed so tests don't rely on them: collisions are "closer than 0.5 m"; every
 * object has a stand-in's size; the camera's shot is recorded, not framed; the rendered frame is a
 * few bytes derived from the state hash.
 */
import {
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
import type { FrameImage, Speech, Stage, LoadOptions, Missing } from '../contract.ts';
import { length, sub } from '../math.ts';
import { checkPictureSize } from '../picture.ts';
import { Timeline, hashState, standInShape, type Touching } from '../timeline.ts';
import { humanoidsFor } from '../humanoid/library.ts';
import { resolveBackdropKnown } from '../backdrops.ts';

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
}

const ACTORS: readonly StoryClass[] = ['Biped', 'Quadruped', 'Flyer', 'Swimmer', 'Slitherer'];
const defaultJoints: NonNullable<FakeStageOptions['jointsFor']> = (cls) =>
  ACTORS.includes(cls) ? [jointName('head'), jointName('neck')] : [];

const closeBy: Touching = (a, b) => length(sub(a.transform.position, b.transform.position)) < 0.5;

export class FakeStage implements Stage {
  readonly calls: FakeStageCall[] = [];
  private readonly timeline = new Timeline();
  /** What the last `load` couldn't find. */
  private lost: readonly Missing[] = [];
  private listeners = new Set<(e: StageEvent) => void>();
  private readonly options: FakeStageOptions;

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
  async load(setup: SceneSetup, options?: LoadOptions): Promise<void> {
    this.record('load', options ? [setup, options] : [setup]);
    // What it can't find shows as a stand-in, and the scene plays on (spec 03 section 1.3).
    const known = this.options.knownModels;
    const lost: Missing[] = resolveBackdropKnown(setup.backdrop).missing.map((id) => ({
      kind: 'backdrop',
      id,
    }));
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
    const { library, navigation } = await humanoidsFor(setup);
    this.timeline.useHumanoids(library, navigation);
    this.lost = lost;
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
  }
}

function hashPicture(h: number, width: number, height: number): FrameImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < data.length; p += 4)
    data.set([h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, 255], p);
  return { width, height, data };
}
