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
import '@babylonjs/core/Engines/Extensions/engine.readTexture.js';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { Frustum } from '@babylonjs/core/Maths/math.frustum.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { Scene } from '@babylonjs/core/scene.js';
import { SCENE_BUDGET, jointsOf, skeletonOf } from '@storystage/backstage';
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
import { checkPictureSize } from '../picture.ts';
import { Timeline, standInShape, type Touching } from '../timeline.ts';
import { humanoidsFor } from '../humanoid/library.ts';
import { buildBackdrop, type ShowSky } from './backdrop.ts';
import { buildFade } from './fade.ts';
import type { Quality, Renderer } from './quality.ts';
import { ModelLibrary, type ModelSource, type PlacedModel } from './models.ts';
import { buildStandIn } from './stand-in.ts';
import { setRotation, type ObjectView } from './view.ts';

/** A camera with no rotation looks along +Z. */
const CAMERA_TURN: Quat = { x: 0, y: 1, z: 0, w: 0 };
/** Alice's clipping distances. The viewing angle is the timeline's `lens`. */
const NEAR = 0.125;
const FAR = 256;

/** A pair being watched for proximity, and the distance that counts as near. */
interface Near {
  readonly a: ObjectId;
  readonly b: ObjectId;
  readonly distance: number;
}

/** With no models to find, a scene can still use stand-ins. */
const NO_MODELS: ModelSource = { find: () => null };

export interface BabylonStageParts {
  readonly models?: ModelSource;
  /** Which renderer the engine is (`createBabylonStage` chose it). */
  readonly renderer?: Renderer;
  readonly quality?: Quality;
}

/** How much the scene asks of the device, against Backstage's scene budget (WP3.9). */
export interface SceneMeasure {
  readonly triangles: number;
  readonly budget: number;
  readonly fits: boolean;
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
  private showSky: ShowSky | null = null;
  private showFade: ((amount: number) => void) | null = null;
  private watches: readonly Watch[] = [];
  /** What was true at the last check, so that events fire on a change. */
  private touchingPairs = new Map<string, readonly [ObjectId, ObjectId]>();
  private nearPairs = new Map<string, Near>();
  private inView = new Set<ObjectId>();
  private drawing: (() => void) | null = null;

  readonly renderer: Renderer;
  readonly quality: Quality;

  constructor(
    engine: AbstractEngine,
    { models = NO_MODELS, renderer = 'webgl2', quality = 'standard' }: BabylonStageParts = {},
  ) {
    this.engine = engine;
    this.models = models;
    this.renderer = renderer;
    this.quality = quality;
  }

  /**
   * The triangles the loaded scene draws, everything included, against the scene budget. The
   * budget is provisional until the reference devices have been measured (#6).
   */
  measure(): SceneMeasure {
    const scene = this.loaded();
    let triangles = 0;
    for (const mesh of scene.meshes) if (mesh.isEnabled()) triangles += mesh.getTotalIndices() / 3;
    const budget = SCENE_BUDGET.triangles;
    return { triangles, budget, fits: triangles <= budget };
  }

  async load(setup: SceneSetup): Promise<void> {
    const backdrop = resolveBackdrop(setup.backdrop);
    const scene = new Scene(this.engine);
    scene.useRightHandedSystem = true;
    const library = new ModelLibrary(scene, this.models);
    try {
      const showSky = buildBackdrop(scene, backdrop);
      const camera = new FreeCamera('camera', Vector3.Zero(), scene);
      camera.minZ = NEAR;
      camera.maxZ = FAR;
      const placed = await Promise.all(setup.objects.map((o) => place(o, library, scene)));
      const objects = new Map(setup.objects.map((o, i) => [o.id, placed[i]!]));
      this.timeline.load(setup, (o) => objects.get(o.id)!.shape);
      const humanoids = await humanoidsFor(setup);
      this.timeline.useHumanoids(humanoids.library, humanoids.navigation);
      this.library?.dispose();
      this.scene?.dispose();
      this.scene = scene;
      this.library = library;
      this.camera = camera;
      this.showSky = showSky;
      this.showFade = buildFade(scene, camera);
      this.watches = [];
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
    this.notice(false);
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
    this.notice(false);
  }

  /** Only time going forward fires events: rewinding fires nothing. */
  seek(t: Micros): void {
    const forward = t >= this.timeline.time();
    this.timeline.seek(t);
    this.show();
    this.notice(forward);
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
    if (this.listeners.size === 1) this.notice(false);
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

  watch(watches: readonly Watch[]): void {
    const objects = new Set(this.objects());
    for (const watch of watches) {
      const ids = watch.kind === 'view' ? watch.objects : [...watch.a, ...watch.b];
      const missing = ids.find((id) => !objects.has(id));
      if (missing !== undefined)
        throw new StageError('unknown_object', `There is nothing called ${missing} in this scene.`);
      if (watch.kind === 'proximity' && !(watch.distance >= 0))
        throw new StageError('bad_argument', 'A distance is zero or more metres.');
    }
    this.watches = structuredClone(watches);
    this.notice(false);
  }

  /** A key press, by its Story API name. */
  key(key: string): void {
    this.fire({ kind: 'key', key, at: this.time() });
  }

  /** A key let go, by its Story API name. */
  keyRelease(key: string): void {
    this.fire({ kind: 'keyRelease', key, at: this.time() });
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

  /**
   * WP5.7: the scene at `at`, drawn into a picture of its own. The scene goes back to its last
   * `seek` before the picture is read, so a live frame drawn meanwhile shows the right time, and
   * no events fire.
   */
  async picture(at: Micros, width: number, height: number): Promise<FrameImage> {
    const scene = this.loaded();
    checkPictureSize(width, height);
    await scene.whenReadyAsync();
    const target = new RenderTargetTexture('picture', { width, height }, scene, {
      generateMipMaps: false,
      // Smoothed edges, as a frame on screen has.
      samples: 4,
    });
    try {
      target.renderList = scene.meshes.slice();
      target.activeCamera = this.camera;
      const now = this.timeline.time();
      try {
        this.timeline.seek(at);
        this.show();
        target.render();
      } finally {
        this.timeline.seek(now);
        this.show();
      }
      const pixels = await target.readPixels();
      if (!pixels) throw new StageError('bad_argument', 'The picture could not be read back.');
      const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, width * height * 4);
      return { width, height, data: topRowFirst(bytes, width, height) };
    } finally {
      target.dispose();
    }
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

  /**
   * Brings what's touching, near and in view up to date. With `announce`, fires an event for
   * each change; without, only remembers, so nothing fires for what was already so.
   */
  private notice(announce: boolean): void {
    if (this.listeners.size === 0) return;
    const at = this.time();
    const hulls = new Map(
      [...this.views].map(([id, view]) => [id, hullOf(view.box, this.timeline.transform(id))]),
    );
    const ids = [...hulls.keys()];
    const touching = new Map<string, readonly [ObjectId, ObjectId]>();
    ids.forEach((a, i) => {
      for (const b of ids.slice(i + 1))
        if (within(hulls.get(a)!, hulls.get(b)!)) touching.set(`${a}\n${b}`, [a, b]);
    });
    const near = new Map<string, Near>();
    this.watches.forEach((watch, n) => {
      if (watch.kind !== 'proximity') return;
      for (const a of watch.a)
        for (const b of watch.b) {
          const ha = hulls.get(a);
          const hb = hulls.get(b);
          if (a !== b && ha && hb && within(ha, hb, watch.distance))
            near.set(`${n}\n${a}\n${b}`, { a, b, distance: watch.distance });
        }
    });
    const seen = this.visible(
      new Set(this.watches.flatMap((w) => (w.kind === 'view' ? w.objects : []))),
    );
    if (announce) {
      for (const [pair, [a, b]] of touching)
        if (!this.touchingPairs.has(pair)) this.fire({ kind: 'collisionStart', a, b, at });
      for (const [pair, [a, b]] of this.touchingPairs)
        if (!touching.has(pair)) this.fire({ kind: 'collisionEnd', a, b, at });
      for (const [pair, p] of near)
        if (!this.nearPairs.has(pair)) this.fire({ kind: 'proximityEnter', ...p, at });
      for (const [pair, p] of this.nearPairs)
        if (!near.has(pair)) this.fire({ kind: 'proximityExit', ...p, at });
      for (const object of seen)
        if (!this.inView.has(object)) this.fire({ kind: 'viewEnter', object, at });
      for (const object of this.inView)
        if (!seen.has(object)) this.fire({ kind: 'viewExit', object, at });
    }
    this.touchingPairs = touching;
    this.nearPairs = near;
    this.inView = seen;
  }

  /** Which of these objects the camera can see any part of. Faded away is out of sight. */
  private visible(objects: ReadonlySet<ObjectId>): Set<ObjectId> {
    const out = new Set<ObjectId>();
    if (!this.camera || objects.size === 0) return out;
    this.camera.computeWorldMatrix();
    const planes = Frustum.GetPlanes(
      this.camera.getViewMatrix(true).multiply(this.camera.getProjectionMatrix(true)),
    );
    for (const id of objects) {
      const meshes = this.views.get(id)?.meshes ?? [];
      const showing = (m: AbstractMesh) => {
        if (!m.isEnabled() || m.visibility <= 0) return false;
        m.computeWorldMatrix(true);
        return m.isInFrustum(planes);
      };
      if (meshes.some(showing)) out.add(id);
    }
    return out;
  }

  /** Copies the timeline's state onto the scene. */
  private show(): void {
    const state = this.timeline.current();
    for (const [id, view] of this.views) {
      const shown = this.timeline.shown(id);
      view.show(state.get(id)!, this.timeline.transform(id), {
        ...(shown.human ? { human: shown.human } : {}),
        clips: shown.own,
        face: shown.face,
        blink: shown.blink,
      });
    }
    this.showSky?.(this.timeline.sky());
    this.showFade?.(this.timeline.fade());
    if (this.camera) {
      const { position, rotation } = this.timeline.transform(CAMERA);
      this.camera.position.set(position.x, position.y, position.z);
      setRotation(this.camera, mul(rotation, CAMERA_TURN));
      this.camera.fov = this.timeline.lens() * 2 * Math.PI;
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
    shape: standInShape(skeleton ? jointsOf(skeleton).map((d) => d.id) : []),
  };
}
