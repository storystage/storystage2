/**
 * The Babylon.js stage (WP5). The timeline works the scene out; this class only shows it. Each
 * `seek` copies the timeline's state onto Babylon.js objects, and nothing else ever moves them,
 * so a frame depends only on the scene time.
 *
 * The scene is right-handed, as the contract says. Babylon.js's cameras look along -Z there, but
 * the contract has everything facing +Z, so the camera's node is turned half a turn (see `show`).
 * That puts +X on the left of the screen, which is what spec 02 calls left.
 */
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import '@babylonjs/core/Culling/ray.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import { jointsOf, skeletonOf } from '@storystage/backstage';
import {
  CAMERA,
  StageError,
  type JointName,
  type Micros,
  type ObjectId,
  type Quat,
  type SceneObjectSetup,
  type SceneSetup,
  type StageCommand,
  type StageEvent,
  type StageQuery,
  type StageQueryResult,
  type Transform,
  type Watch,
} from '@storystage/story-api';
import { resolveBackdrop } from '../backdrops.ts';
import type { FrameImage, Speech, Stage } from '../contract.ts';
import { hullOf, within } from '../hull.ts';
import { mul } from '../math.ts';
import { Timeline, type Touching } from '../timeline.ts';
import { buildBackdrop } from './backdrop.ts';
import { ModelLibrary, type ModelSource, type PlacedModel } from './models.ts';
import { buildStandIn } from './stand-in.ts';
import { setRotation, type ObjectView } from './view.ts';

/** A camera with no rotation looks along +Z. */
const CAMERA_TURN: Quat = { x: 0, y: 1, z: 0, w: 0 };
/** Alice's vertical viewing angle and clipping distances. */
const FIELD_OF_VIEW = 0.5;
const NEAR = 0.125;
const FAR = 256;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** With no models to find, a scene can still use stand-ins. */
const NO_MODELS: ModelSource = { find: () => null };

export interface BabylonStageParts {
  readonly models?: ModelSource;
}

/** WebGL's rows start at the bottom; a `FrameImage`'s start at the top. */
function topRowFirst(bottomUp: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const row = width * 4;
  for (let y = 0; y < height; y++)
    out.set(bottomUp.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
  return out;
}

export class BabylonStage implements Stage {
  private readonly engine: AbstractEngine;
  private readonly models: ModelSource;
  private readonly timeline = new Timeline();
  private readonly listeners = new Set<(e: StageEvent) => void>();
  private scene: Scene | null = null;
  private library: ModelLibrary | null = null;
  private camera: FreeCamera | null = null;
  private views = new Map<ObjectId, ObjectView>();
  private owners = new Map<AbstractMesh, ObjectId>();
  private touchingPairs = new Map<string, readonly [ObjectId, ObjectId]>();
  private drawing: (() => void) | null = null;

  constructor(engine: AbstractEngine, { models = NO_MODELS }: BabylonStageParts = {}) {
    this.engine = engine;
    this.models = models;
  }

  async load(setup: SceneSetup): Promise<void> {
    const backdrop = resolveBackdrop(setup.backdrop);
    const scene = new Scene(this.engine);
    scene.useRightHandedSystem = true;
    const library = new ModelLibrary(scene, this.models);
    try {
      buildBackdrop(scene, backdrop);
      const camera = new FreeCamera('camera', Vector3.Zero(), scene);
      const fieldOfView = setup.camera.fieldOfViewDegrees;
      camera.fov = fieldOfView === undefined ? FIELD_OF_VIEW : radians(fieldOfView);
      camera.minZ = NEAR;
      camera.maxZ = FAR;
      const placed = await Promise.all(setup.objects.map((o) => place(o, library, scene)));
      const objects = new Map(setup.objects.map((o, i) => [o.id, placed[i]!]));
      this.timeline.load(setup, (o) => objects.get(o.id)!.joints);
      this.library?.dispose();
      this.scene?.dispose();
      this.scene = scene;
      this.library = library;
      this.camera = camera;
      this.views = new Map([...objects].map(([id, { view }]) => [id, view]));
      this.owners = new Map(
        [...this.views].flatMap(([id, view]) => view.meshes.map((m) => [m, id] as const)),
      );
    } catch (e) {
      library.dispose();
      scene.dispose();
      throw e;
    }
    this.show();
    this.noticeTouching(false);
    await scene.whenReadyAsync();
  }

  objects(): readonly ObjectId[] {
    return this.timeline.objects();
  }

  joints(object: ObjectId): readonly JointName[] {
    return this.timeline.joints(object);
  }

  schedule(commands: readonly StageCommand[]): void {
    this.timeline.schedule(commands);
    this.show();
  }

  reset(): void {
    this.timeline.reset();
    this.show();
    this.noticeTouching(false);
  }

  /** Only time going forward can start a collision: rewinding fires nothing. */
  seek(t: Micros): void {
    const forward = t >= this.timeline.time();
    this.timeline.seek(t);
    this.show();
    this.noticeTouching(forward);
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
    return this.timeline.answer(query, this.touching);
  }

  onEvent(listener: (event: StageEvent) => void): () => void {
    this.listeners.add(listener);
    // Nothing keeps track of who's touching while nobody is listening.
    if (this.listeners.size === 1) this.noticeTouching(false);
    return () => this.listeners.delete(listener);
  }

  /** A click on the picture, in its own pixels from the top left. */
  click(x: number, y: number): void {
    const scene = this.loaded();
    for (const mesh of this.owners.keys()) mesh.computeWorldMatrix(true);
    const hit = scene.pick(x, y, (m) => m.isEnabled() && this.owners.has(m));
    const object = hit.pickedMesh ? this.owners.get(hit.pickedMesh)! : null;
    const across = x / this.engine.getRenderWidth();
    const up = 1 - y / this.engine.getRenderHeight();
    this.fire({ kind: 'click', object, x: across, y: up, at: this.time() });
  }

  /** Proximity and view events come with WP4b's stage work; until then nothing is watched. */
  watch(_watches: readonly Watch[]): void {}

  /** A key press, by its Story API name. */
  key(key: string): void {
    this.fire({ kind: 'key', key, at: this.time() });
  }

  /**
   * Draws every frame until `stopLive`. `beforeFrame` runs first, for the runtime bridge to
   * `seek` to the clock's time. For a fixed time step, use `seek` and `renderFrame` instead.
   */
  startLive(beforeFrame: () => void = () => {}): void {
    this.stopLive();
    this.drawing = () => {
      beforeFrame();
      this.scene?.render();
    };
    this.engine.runRenderLoop(this.drawing);
  }

  stopLive(): void {
    if (this.drawing) this.engine.stopRenderLoop(this.drawing);
    this.drawing = null;
  }

  /** Call when the canvas changes size. */
  resize(): void {
    this.engine.resize();
  }

  stateHash(): number {
    return this.timeline.stateHash();
  }

  async renderFrame(): Promise<FrameImage> {
    const scene = this.loaded();
    // A material can need a new shader part-way through a film (spike 1.4, rule 5).
    await scene.whenReadyAsync();
    scene.render();
    const width = this.engine.getRenderWidth();
    const height = this.engine.getRenderHeight();
    const pixels = await this.engine.readPixels(0, 0, width, height);
    return { width, height, data: topRowFirst(pixels as Uint8Array, width, height) };
  }

  dispose(): void {
    this.stopLive();
    this.listeners.clear();
    this.library?.dispose();
    this.scene?.dispose();
    this.scene = null;
    this.engine.dispose();
  }

  private loaded(): Scene {
    if (!this.scene) throw new StageError('bad_argument', 'There is no scene loaded yet.');
    return this.scene;
  }

  private readonly touching: Touching = (a, b) => {
    const boxA = this.views.get(a.id)?.box;
    const boxB = this.views.get(b.id)?.box;
    return !!boxA && !!boxB && within(hullOf(boxA, a.transform), hullOf(boxB, b.transform));
  };

  private fire(event: StageEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  /** Brings the list of who's touching up to date, firing for any new pair if `announce`. */
  private noticeTouching(announce: boolean): void {
    if (this.listeners.size === 0) return;
    const placed = [...this.views].map(([id, view]) => ({
      id,
      hull: hullOf(view.box, this.timeline.transform(id)),
    }));
    const now = new Map<string, readonly [ObjectId, ObjectId]>();
    placed.forEach((a, i) => {
      for (const b of placed.slice(i + 1))
        if (within(a.hull, b.hull)) now.set(`${a.id}\n${b.id}`, [a.id, b.id]);
    });
    if (announce)
      for (const [pair, [a, b]] of now)
        if (!this.touchingPairs.has(pair))
          this.fire({ kind: 'collisionStart', a, b, at: this.time() });
    this.touchingPairs = now;
  }

  /** Copies the timeline's state onto the scene. */
  private show(): void {
    const state = this.timeline.current();
    for (const [id, view] of this.views) view.show(state.get(id)!, this.timeline.transform(id));
    if (this.camera) {
      const { position, rotation } = this.timeline.transform(CAMERA);
      this.camera.position.set(position.x, position.y, position.z);
      setRotation(this.camera, mul(rotation, CAMERA_TURN));
    }
  }
}

/** A stand-in has its class's joints, so code written for the real model still runs. */
function place(
  object: SceneObjectSetup,
  library: ModelLibrary,
  scene: Scene,
): PlacedModel | Promise<PlacedModel> {
  if (typeof object.model === 'string') return library.place(object.id, object.model, object.class);
  const skeleton = skeletonOf(object.class);
  return {
    view: buildStandIn(object.id, object.model.standIn, scene),
    joints: skeleton ? jointsOf(skeleton).map((d) => d.id) : [],
  };
}
