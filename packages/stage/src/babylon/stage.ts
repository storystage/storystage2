/**
 * The Babylon.js stage (WP5). The timeline works the scene out; this class only shows it. Each
 * `seek` copies the timeline's state onto Babylon.js objects, and nothing else ever moves them,
 * so a frame depends only on the scene time.
 *
 * The scene is right-handed, as the contract says. Babylon.js's cameras look along -Z there, but
 * the contract has everything facing +Z, so the camera's node is turned half a turn (see `show`).
 * That puts +X on the left of the screen, which is what spec 02 calls left.
 */
import { Logger } from '@babylonjs/core/Misc/logger.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import '@babylonjs/core/Culling/ray.js';
import '@babylonjs/core/Engines/Extensions/engine.readTexture.js';
import { Layer } from '@babylonjs/core/Layers/layer.js';
import { RenderTargetTexture } from '@babylonjs/core/Materials/Textures/renderTargetTexture.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { Ray as PickRay } from '@babylonjs/core/Culling/ray.core.js';
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
  type Vec3,
} from '@storystage/story-api';
import { resolveBackdropKnown } from '../backdrops.ts';
import { drawObjectsWhole } from './draw-order.ts';
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
  ViewStep,
} from '../contract.ts';
import {
  FAR as VIEW_FAR,
  MARKER_BOX,
  groundPoint,
  rayHitsBox,
  viewRay,
  type Ray,
} from '../editing.ts';
import {
  handleAt,
  handlePlaces,
  moveAlongGround,
  moveUpDown,
  resizeEvenly,
  turnAbout,
  type Handle,
  type HandlePlaces,
  type Viewing,
} from '../handles.ts';
import {
  orbitBy,
  orbitDrag,
  orbitFrom,
  orbitPanDrag,
  orbitStep,
  orbitView,
  stepCamera,
  type Orbit,
} from '../orbit.ts';
import { hullOf, within, type Box } from '../hull.ts';
import { inOrder } from '../missing.ts';
import { add, mul, rotate, scale, sub, v } from '../math.ts';
import { checkPictureSize } from '../picture.ts';
import { Timeline, standInBox, standInShape, type Touching } from '../timeline.ts';
import { humanoidsFor } from '../humanoid/library.ts';
import { backdropItems, buildBackdrop, loadBackdropParts, type ShowSky } from './backdrop.ts';
import { EditView, type EditDrawing } from './edit-view.ts';
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
  /** Drawing an export, frame by frame: a crossfade's old scene always moves. */
  readonly offscreen?: boolean;
}

/** How much the scene asks of the device, against Backstage's scene budget (WP3.9). */
export interface SceneMeasure {
  readonly triangles: number;
  readonly budget: number;
  readonly fits: boolean;
}

/** How many times wider and taller an export, or a picture, is drawn, before it's averaged down. */
export const SUPERSAMPLE = 2;

/** Each `k` by `k` block of pixels averaged into one, in whole numbers, so it's the same every time. */
function averageBlocks(
  big: Uint8ClampedArray,
  width: number,
  height: number,
  k: number,
): Uint8ClampedArray {
  if (k === 1) return big;
  const out = new Uint8ClampedArray(width * height * 4);
  const bigWidth = width * k;
  const n = k * k;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = 0; dy < k; dy++)
          for (let dx = 0; dx < k; dx++)
            sum += big[((y * k + dy) * bigWidth + x * k + dx) * 4 + c]!;
        out[(y * width + x) * 4 + c] = Math.floor((sum + n / 2) / n);
      }
  return out;
}

/**
 * Pixels read back, as a `FrameImage` has them: top row first, red, green, blue, alpha.
 * - WebGL reads the bottom row first.
 * - WebGPU reads the canvas top row first, in its own channel order, which is blue first on most
 *   devices (`bgra8unorm`).
 * - A render target (`picture`) comes back bottom row first and red first on both.
 */
function asFrame(
  read: Uint8Array,
  width: number,
  height: number,
  { bottomUp, bgra }: { bottomUp: boolean; bgra: boolean },
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  const row = width * 4;
  for (let y = 0; y < height; y++)
    out.set(read.subarray(y * row, (y + 1) * row), (bottomUp ? height - 1 - y : y) * row);
  if (bgra)
    for (let p = 0; p < out.length; p += 4) {
      const blue = out[p]!;
      out[p] = out[p + 2]!;
      out[p + 2] = blue;
    }
  return out;
}

export class BabylonStage implements EditableStage {
  private readonly engine: AbstractEngine;
  private readonly models: ModelSource;
  private timeline = new Timeline();
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
  /** What the last `load` couldn't find (spec 03 section 1.3). */
  private lost: readonly Missing[] = [];
  /** A scene that will probably come next, its models loading (WP8.2). */
  private preloaded: { scene: Scene; library: ModelLibrary } | null = null;
  /** The scene before, fading out over this one (WP8.3). */
  private leaving: Leaving | null = null;
  private readonly offscreen: boolean;
  /** Each object's shape as placed, so a load that changes only places can keep the scene. */
  private shapes = new Map<ObjectId, PlacedModel['shape']>();
  private placedAs = '';
  // The scene view (07-ux section 7.2).
  private isEditing = false;
  private chosenTarget: EditTarget | null = null;
  /** Look around's camera while it's on: where it is, and its orbit once it has moved. */
  private around: { view: Transform; orbit: Orbit | null } | null = null;
  private viewCamera: FreeCamera | null = null;
  private editView: EditView | null = null;
  private readonly editListeners = new Set<(e: EditEvent) => void>();
  private readonly tapListeners = new Set<(p: Picked) => void>();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private gesture: Gesture | null = null;
  /** How many loads have been asked for: the newest wins (`load`). */
  private loads = 0;
  /** When each character's skin was last brought to its drawn pose, for picking. */
  private skinned = new WeakMap<AbstractMesh, string>();

  readonly renderer: Renderer;
  readonly quality: Quality;

  constructor(
    engine: AbstractEngine,
    {
      models = NO_MODELS,
      renderer = 'webgl2',
      quality = 'standard',
      offscreen = false,
    }: BabylonStageParts = {},
  ) {
    this.offscreen = offscreen;
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

  async preload(setup: SceneSetup): Promise<void> {
    this.dropPreloaded();
    const scene = this.newScene();
    const library = new ModelLibrary(scene, this.models);
    this.preloaded = { scene, library };
    await Promise.all([
      ...setup.objects.flatMap((o) =>
        typeof o.model === 'string' ? [library.prefetch(o.model)] : [],
      ),
      ...backdropItems(resolveBackdropKnown(setup.backdrop).backdrop).map(async (id) => {
        if (await library.has(id)) await library.prefetch(id);
      }),
      humanoidsFor(setup).then(
        () => {},
        () => {},
      ),
    ]);
  }

  missing(): readonly Missing[] {
    return this.lost;
  }

  /**
   * Loads may overlap, as the studio's set-up load and Rehearse's can: the newest call wins,
   * whichever finishes first. A load overtaken by a newer one drops only the scene it was
   * building and settles without taking over (found by S2: Rehearse stuck at starting).
   */
  async load(setup: SceneSetup, options: LoadOptions = {}): Promise<void> {
    const ticket = ++this.loads;
    const overtaken = () => ticket !== this.loads;
    const placedAs = placement(setup);
    if (this.scene && placedAs === this.placedAs && !options.crossfade && !this.leaving) {
      await this.loadInPlace(setup, overtaken);
      return;
    }
    const known = resolveBackdropKnown(setup.backdrop);
    const backdrop = known.backdrop;
    const missing: Missing[] = known.missing.map((id) => ({ kind: 'backdrop', id }));
    // A scene got ready ahead, whether this one or not, keeps what it has loaded.
    const ready = this.preloaded;
    this.preloaded = null;
    const scene = ready?.scene ?? this.newScene();
    const library = ready?.library ?? new ModelLibrary(scene, this.models);
    const timeline = new Timeline();
    const crossfade = options.crossfade ?? 0;
    if (!(Number.isInteger(crossfade) && crossfade >= 0)) {
      this.dropScene(scene, library);
      throw new StageError(
        'bad_argument',
        'A crossfade lasts a whole number of microseconds, 0 or more.',
      );
    }
    try {
      const parts = await loadBackdropParts(scene, backdrop, library, missing);
      const showSky = buildBackdrop(scene, backdrop, parts);
      const camera = new FreeCamera('camera', Vector3.Zero(), scene);
      camera.minZ = NEAR;
      camera.maxZ = FAR;
      const placed = await Promise.all(setup.objects.map((o) => place(o, library, scene, missing)));
      const objects = new Map(setup.objects.map((o, i) => [o.id, placed[i]!]));
      timeline.load(setup, (o) => objects.get(o.id)!.shape);
      const humanoids = await humanoidsFor(setup);
      timeline.useHumanoids(humanoids.library, humanoids.navigation);
      if (overtaken()) {
        this.dropScene(scene, library);
        return;
      }
      this.dropLeaving();
      if (crossfade > 0 && this.scene && this.camera) {
        // The old scene, drawn into a picture each frame, laid over the new one (`fadeLeaving`).
        const target = new RenderTargetTexture(
          'leaving',
          { width: this.engine.getRenderWidth(), height: this.engine.getRenderHeight() },
          this.scene,
          { generateMipMaps: false },
        );
        target.renderList = this.scene.meshes.slice();
        target.activeCamera = this.camera;
        const layer = new Layer('leaving', null, scene, false);
        layer.texture = target;
        this.leaving = {
          scene: this.scene,
          library: this.library!,
          camera: this.camera,
          views: this.views,
          showSky: this.showSky,
          showFade: this.showFade,
          timeline: this.timeline,
          from: this.timeline.time(),
          duration: crossfade,
          target,
          layer,
        };
      } else this.dropScene(this.scene, this.library);
      this.timeline = timeline;
      this.lost = inOrder(setup, missing, (id) => objects.get(id)?.shape.joints ?? []);
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
      const viewOf = new Map(
        [...objects.values()].flatMap(({ view }) => view.meshes.map((m) => [m, view] as const)),
      );
      drawObjectsWhole(scene, (mesh) => viewOf.get(mesh));
      this.shapes = new Map([...objects].map(([id, { shape }]) => [id, shape]));
      this.placedAs = placedAs;
      // The scene view's camera and drawing belonged to the scene before.
      this.editView?.dispose();
      this.editView = null;
      this.viewCamera = null;
      this.gesture = null;
    } catch (e) {
      this.dropScene(scene, library);
      throw e;
    }
    this.keepSceneView();
    this.show();
    this.notice(false);
    // A newer load may drop this scene before it's ready, and then it never will be.
    await readyOrGone(scene);
    await this.warm(scene);
  }

  /**
   * Babylon.js gets a model's face shapes right only from the second drawing of them, so the
   * first frame with a face showed none (seen on Seed-san), and the live loop drew a cut-out's
   * first fades without blending while that shader compiled. Draws every face shape a little,
   * and then none, and each cut-out part faded, unseen, as a scene loads.
   */
  private async warm(scene: Scene): Promise<void> {
    const views = [...this.views.values()].filter((v) => v.needsWarming);
    if (views.length === 0 || scene.isDisposed || !this.camera) return;
    const unseen = new RenderTargetTexture('warm', { width: 16, height: 16 }, scene, {
      generateMipMaps: false,
    });
    try {
      unseen.renderList = scene.meshes.slice();
      unseen.activeCamera = this.camera;
      for (const warm of [true, false]) {
        for (const view of views) view.warm(warm);
        unseen.render();
        await readyOrGone(scene);
        if (scene.isDisposed || scene !== this.scene) return;
        unseen.render();
      }
    } finally {
      unseen.dispose();
      for (const view of views) view.warm(null);
      if (scene === this.scene) this.show();
    }
  }

  /**
   * A set-up with the same objects, models and backdrop as the scene loaded, only placed, painted
   * or faded differently: a new timeline on the same scene, so nothing is built again and the
   * picture doesn't flicker (the studio loads the set-up again after each change in the scene view).
   */
  private async loadInPlace(setup: SceneSetup, overtaken: () => boolean): Promise<void> {
    const timeline = new Timeline();
    timeline.load(setup, (o) => this.shapes.get(o.id)!);
    const humanoids = await humanoidsFor(setup);
    if (overtaken()) return;
    timeline.useHumanoids(humanoids.library, humanoids.navigation);
    this.timeline = timeline;
    // The same models and backdrop, but the pose may have changed.
    this.lost = inOrder(setup, this.lost, (id) => this.shapes.get(id)?.joints ?? []);
    this.watches = [];
    this.keepSceneView();
    this.show();
    this.notice(false);
  }

  /** After a load: what's chosen while it's still there, and Look around's camera, as it was. */
  private keepSceneView(): void {
    if (this.chosenTarget && !this.has(this.chosenTarget)) this.chosenTarget = null;
    if (this.around && !this.viewCamera) this.viewCamera = this.newViewCamera();
    this.touchAction();
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
    this.dropLeaving();
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
    this.placeForPicking(scene);
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
      this.leaving?.target.render();
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
    await readyOrGone(scene);
    // A load meanwhile replaced the scene: the frame is the new one's.
    if (scene !== this.scene) return this.renderFrame();
    if (this.leaving) {
      await readyOrGone(this.leaving.scene);
      if (scene !== this.scene) return this.renderFrame();
      this.leaving?.target.render();
    }
    const drawnWidth = this.engine.getRenderWidth();
    const drawnHeight = this.engine.getRenderHeight();
    // A frame is always the scene's camera, and never shows handles or markers.
    const view = scene.activeCamera;
    scene.activeCamera = this.camera;
    if (this.editView) this.editView.showing = false;
    let pixels: ArrayBufferView;
    try {
      scene.render();
      pixels = await this.engine.readPixels(0, 0, drawnWidth, drawnHeight);
    } finally {
      scene.activeCamera = view;
      if (this.editView) this.editView.showing = true;
    }
    // An export is drawn bigger, then averaged down to the size asked for.
    const k = this.offscreen ? SUPERSAMPLE : 1;
    const width = Math.floor(drawnWidth / k);
    const height = Math.floor(drawnHeight / k);
    const webgpu = this.renderer === 'webgpu';
    // A WebGPU canvas keeps its own channel order: blue first on most devices.
    const format = (this.engine as unknown as { _options?: { swapChainFormat?: string } })._options
      ?.swapChainFormat;
    const bgra = webgpu && (format ?? '').startsWith('bgra');
    return {
      width,
      height,
      data: averageBlocks(
        asFrame(pixels as Uint8Array, width * k, height * k, { bottomUp: !webgpu, bgra }),
        width,
        height,
        k,
      ),
    };
  }

  /**
   * WP5.7: the scene at `at`, drawn into a picture of its own. The scene goes back to its last
   * `seek` before the picture is read, so a live frame drawn meanwhile shows the right time, and
   * no events fire.
   */
  async picture(at: Micros, width: number, height: number): Promise<FrameImage> {
    const scene = this.loaded();
    checkPictureSize(width, height);
    await readyOrGone(scene);
    if (scene !== this.scene) return this.picture(at, width, height);
    // Smoothed edges, as an export's frames are: drawn bigger with no multisampling, which a GPU
    // doesn't repeat exactly, then averaged. A picture too big for that is drawn as asked.
    const most = this.engine.getCaps().maxTextureSize;
    const k = Math.max(width, height) * SUPERSAMPLE <= most ? SUPERSAMPLE : 1;
    const target = new RenderTargetTexture(
      'picture',
      { width: width * k, height: height * k },
      scene,
      {
        generateMipMaps: false,
      },
    );
    try {
      target.renderList = scene.meshes.slice();
      target.activeCamera = this.camera;
      const now = this.timeline.time();
      try {
        this.timeline.seek(at);
        this.show();
        placeForPicture(scene);
        target.render();
      } finally {
        this.timeline.seek(now);
        this.show();
      }
      const pixels = await target.readPixels();
      if (!pixels) throw new StageError('bad_argument', 'The picture could not be read back.');
      const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, width * k * height * k * 4);
      // Babylon.js reads a render target back bottom row first on WebGPU too, and red first.
      const big = asFrame(bytes, width * k, height * k, { bottomUp: true, bgra: false });
      return { width, height, data: averageBlocks(big, width, height, k) };
    } finally {
      target.dispose();
    }
  }

  dispose(): void {
    this.stopLive();
    this.listeners.clear();
    this.editListeners.clear();
    this.tapListeners.clear();
    this.editView?.dispose();
    this.editView = null;
    // A load still going is overtaken, so it drops what it was building.
    this.loads++;
    this.dropLeaving();
    this.dropPreloaded();
    this.dropScene(this.scene, this.library);
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
    for (const watch of this.watches) {
      if (watch.kind !== 'proximity') continue;
      for (const a of watch.a)
        for (const b of watch.b) {
          const ha = hulls.get(a);
          const hb = hulls.get(b);
          if (a === b || !ha || !hb || !within(ha, hb, watch.distance)) continue;
          // One event for a pair at a distance, whichever watches find it, whichever way round:
          // the runtime sends a watch for each listener, and matches a pair either way round.
          const pair = `${a < b ? `${a}\n${b}` : `${b}\n${a}`}\n${watch.distance}`;
          if (!near.has(pair)) near.set(pair, { a, b, distance: watch.distance });
        }
    }
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

  private newScene(): Scene {
    const scene = new Scene(this.engine);
    scene.useRightHandedSystem = true;
    return scene;
  }

  private dropScene(scene: Scene | null, library: ModelLibrary | null): void {
    library?.dispose();
    scene?.dispose();
  }

  private dropPreloaded(): void {
    if (!this.preloaded) return;
    this.dropScene(this.preloaded.scene, this.preloaded.library);
    this.preloaded = null;
  }

  private dropLeaving(): void {
    if (!this.leaving) return;
    const { target, layer, scene, library } = this.leaving;
    layer.dispose();
    target.dispose();
    this.dropScene(scene, library);
    this.leaving = null;
  }

  /**
   * The old scene of a crossfade, at the new scene's time: it moves on as far as the new one has
   * come, or holds still on a stage drawing at "low" quality, live, and fades out. Once the
   * crossfade is over, it goes.
   */
  private fadeLeaving(): void {
    const leaving = this.leaving;
    if (!leaving) return;
    const t = this.timeline.time();
    if (t >= leaving.duration) {
      this.dropLeaving();
      return;
    }
    const still = this.quality === 'low' && !this.offscreen;
    leaving.timeline.seek(still ? leaving.from : leaving.from + t);
    showScene(leaving);
    leaving.layer.color.a = 1 - t / leaving.duration;
  }

  /** Copies the timeline's state onto the scene. */
  private show(): void {
    showScene({
      timeline: this.timeline,
      views: this.views,
      showSky: this.showSky,
      showFade: this.showFade,
      camera: this.camera,
    });
    this.fadeLeaving();
    this.showView();
  }

  // The scene view (07-ux section 7.2).

  editing(on: boolean): void {
    this.isEditing = on;
    this.gesture = null;
    if (on && this.scene) this.reset();
    this.touchAction();
    this.showView();
  }

  pick(x: number, y: number): Picked {
    const ray = this.rayAt(x, y);
    return {
      target: this.hit(ray)?.target ?? null,
      ground: groundPoint(ray, this.timeline.ground()),
    };
  }

  choose(target: EditTarget | null): void {
    if (target && !this.has(target))
      throw new StageError(
        'unknown_object',
        'object' in target
          ? `There is nothing called ${target.object} in this scene.`
          : `There is no marker called ${target.marker} in this scene.`,
      );
    this.chosenTarget = target;
    this.gesture = null;
    this.showView();
  }

  onEdit(listener: (event: EditEvent) => void): () => void {
    this.editListeners.add(listener);
    return () => this.editListeners.delete(listener);
  }

  onTap(listener: (picked: Picked) => void): () => void {
    this.tapListeners.add(listener);
    return () => this.tapListeners.delete(listener);
  }

  setObject(object: ObjectId, change: ObjectChange): void {
    this.timeline.setObject(object, change);
    this.show();
    this.notice(false);
  }

  setMarker(id: string, transform: Transform): void {
    this.timeline.setMarker(id, transform);
    this.showView();
  }

  lookAround(on: boolean): void {
    this.around = on ? { view: this.timeline.transform(CAMERA), orbit: null } : null;
    if (on && !this.viewCamera && this.scene) this.viewCamera = this.newViewCamera();
    this.gesture = null;
    this.touchAction();
    this.showView();
  }

  viewTransform(): Transform {
    return this.around?.view ?? this.timeline.transform(CAMERA);
  }

  inShot(): readonly ObjectId[] {
    const objects = this.objects().filter((o) => o !== CAMERA);
    const seen = this.visible(new Set(objects));
    return objects.filter((o) => seen.has(o));
  }

  /**
   * A pointer pressed on the view, in CSS pixels from its top left: the canvas's listeners call
   * these, and so can a test. True if the stage takes the pointer (the canvas then captures it).
   */
  pointerDown(
    x: number,
    y: number,
    { id = 1, shift = false, button = 0 }: { id?: number; shift?: boolean; button?: number } = {},
  ): boolean {
    if (!this.scene || !(this.isEditing || this.around)) return false;
    // The right button pans Look around's camera, and does nothing else.
    if (button === 2 && !this.around) return false;
    this.pointers.set(id, { x, y });
    if (this.pointers.size === 2 && this.around) {
      const [a, b] = [...this.pointers.values()];
      this.gesture = {
        kind: 'pinch',
        apart: Math.hypot(a!.x - b!.x, a!.y - b!.y),
        middle: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 },
      };
      return true;
    }
    if (this.pointers.size > 1) return true;
    // A Shift-drag or a right-drag on Look around pans it, rather than grabbing what's there.
    const pan = !!this.around && (shift || button === 2);
    this.gesture = (pan ? null : this.grab(x, y, id, shift)) ?? {
      kind: 'press',
      id,
      x0: x,
      y0: y,
      x,
      y,
      pan,
    };
    return true;
  }

  pointerMove(x: number, y: number, { id = 1, shift = false } = {}): void {
    if (!this.pointers.has(id)) return;
    this.pointers.set(id, { x, y });
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pinch') {
      // Two fingers: apart or together zooms, and moving together pans.
      const [a, b] = [...this.pointers.values()];
      if (!a || !b) return;
      const apart = Math.hypot(a.x - b.x, a.y - b.y);
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const { height } = this.viewSize();
      const fov = this.viewFov();
      const from = g.middle;
      this.orbit((o) => {
        const zoomed = g.apart > 0 && apart > 0 ? orbitBy(o, 0, 0, apart / g.apart) : o;
        return orbitPanDrag(zoomed, middle.x - from.x, middle.y - from.y, height, fov);
      });
      g.apart = apart;
      g.middle = middle;
      return;
    }
    if (g.id !== id) return;
    if (g.kind === 'press') {
      if (Math.hypot(x - g.x0, y - g.y0) < TAP_SLOP) return;
      if (!this.around) return;
      this.gesture = g.pan
        ? { kind: 'pan', id, x: g.x, y: g.y }
        : { kind: 'orbit', id, x: g.x, y: g.y };
      this.pointerMove(x, y, { id, shift });
      return;
    }
    if (g.kind === 'orbit') {
      const { width, height } = this.viewSize();
      this.orbit((o) => orbitDrag(o, x - g.x, y - g.y, width, height));
      g.x = x;
      g.y = y;
      return;
    }
    if (g.kind === 'pan') {
      const { height } = this.viewSize();
      const fov = this.viewFov();
      this.orbit((o) => orbitPanDrag(o, x - g.x, y - g.y, height, fov));
      g.x = x;
      g.y = y;
      return;
    }
    if (!g.moved && Math.hypot(x - g.x0, y - g.y0) < TAP_SLOP) return;
    g.moved = true;
    this.dragTo(g, x, y, shift);
  }

  pointerUp(x: number, y: number, { id = 1 } = {}): void {
    if (!this.pointers.delete(id)) return;
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (this.pointers.size === 0) this.gesture = null;
      return;
    }
    if (g.id !== id) return;
    this.gesture = null;
    if (g.kind === 'drag' && g.moved) {
      this.fireEdit({ target: g.target, transform: g.last, final: true });
      return;
    }
    // A press that never became a drag is a tap; so is a press on the chosen object itself.
    // A press to pan (Shift or the right button) chooses nothing.
    const tapped = (g.kind === 'press' && !g.pan) || (g.kind === 'drag' && g.handle === 'move');
    if (tapped && this.isEditing) {
      const picked = this.pick(x, y);
      for (const l of [...this.tapListeners]) l(picked);
    }
  }

  /** A pointer the browser took back: a drag ends where it got to. */
  pointerCancel(id = 1): void {
    const g = this.gesture;
    this.pointers.delete(id);
    if (g && g.kind === 'drag' && g.id === id) {
      this.gesture = null;
      if (g.moved) this.fireEdit({ target: g.target, transform: g.last, final: true });
    } else if (this.pointers.size === 0) this.gesture = null;
  }

  /** The wheel, while looking around: nearer or further. True if the stage used it. */
  wheel(deltaY: number): boolean {
    if (!this.around || !this.scene) return false;
    this.orbit((o) => orbitBy(o, 0, 0, Math.exp(-deltaY * WHEEL)));
    return true;
  }

  /**
   * Look around's keys, while the canvas has focus: the arrows circle and tilt it, Shift and the
   * arrows pan it, + and - zoom. True if the stage used the key.
   */
  viewKey(key: string, { shift = false }: { shift?: boolean } = {}): boolean {
    const step = (shift ? PAN_KEYS[key] : undefined) ?? VIEW_KEYS[key];
    return step ? this.viewStep(step) : false;
  }

  viewStep(step: ViewStep): boolean {
    if (!this.around || !this.scene) return false;
    this.orbit((o) => orbitStep(o, step));
    return true;
  }

  steppedCamera(step: ViewStep, around?: Vec3): { transform: Transform; around: Vec3 } {
    const camera = this.timeline.transform(CAMERA);
    return stepCamera(camera, this.timeline.ground(), around ? [] : this.subjects(), step, around);
  }

  /** What the scene view draws over the scene, for a test: none of it is in a frame. */
  editMeshes(): number {
    return this.editView?.showing ? this.editView.meshes().length : 0;
  }

  /**
   * Brings what can be picked up to date: every place, and each character's skin in the pose it's
   * drawn in. Babylon.js picks a skinned mesh in its rest pose otherwise, a T-pose for most, so a
   * tap beside a character's arm chose it and a tap on the arm missed (found on KayKit's knight).
   */
  private placeForPicking(scene: Scene, ray?: Ray): void {
    placeForPicture(scene);
    // Skinning on the CPU costs about 30 ms a character, so it's done again only when the scene
    // has changed, and, for a ray, only for what the ray passes near.
    const now = `${this.timeline.time()} ${this.timeline.stateHash()}`;
    for (const [mesh, id] of this.owners) {
      if (!mesh.skeleton || !mesh.isEnabled() || this.skinned.get(mesh) === now) continue;
      const box = this.views.get(id)?.box;
      if (ray && box && rayHitsBox(ray, grown(box), this.timeline.transform(id)) === null) continue;
      mesh.skeleton.prepare(true);
      mesh.refreshBoundingInfo({ applySkeleton: true, applyMorph: true });
      this.skinned.set(mesh, now);
    }
  }

  private has(target: EditTarget): boolean {
    return 'object' in target
      ? this.objects().includes(target.object)
      : this.timeline.markerPlaces().has(target.marker);
  }

  private fireEdit(event: EditEvent): void {
    for (const l of [...this.editListeners]) l(event);
  }

  /** The view's size in CSS pixels: the canvas's on the page, or what's drawn. */
  private viewSize(): { width: number; height: number } {
    const canvas = this.engine.getRenderingCanvas();
    if (canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0)
      return { width: canvas.clientWidth, height: canvas.clientHeight };
    return { width: this.engine.getRenderWidth(), height: this.engine.getRenderHeight() };
  }

  private viewing(): Viewing {
    return { pose: this.viewTransform(), lens: this.timeline.lens(), ...this.viewSize() };
  }

  private rayAt(x: number, y: number): Ray {
    const { pose, lens, width, height } = this.viewing();
    return viewRay(pose, lens, width, height, x, y);
  }

  /** The nearest object (or, while editing, marker) along a ray, by what's drawn. */
  private hit(ray: Ray): { target: EditTarget; distance: number } | null {
    let nearest: { target: EditTarget; distance: number } | null = null;
    if (this.scene) {
      this.placeForPicking(this.scene, ray);
      const { origin: o, direction: d } = ray;
      const hit = this.scene.pickWithRay(
        new PickRay(new Vector3(o.x, o.y, o.z), new Vector3(d.x, d.y, d.z), VIEW_FAR),
        (m) => m.isEnabled() && m.isPickable && m.visibility > 0 && this.owners.has(m),
      );
      if (hit?.pickedMesh)
        nearest = { target: { object: this.owners.get(hit.pickedMesh)! }, distance: hit.distance };
    }
    if (this.isEditing)
      for (const [marker, pose] of this.timeline.markerPlaces()) {
        const distance = rayHitsBox(ray, MARKER_BOX, { ...pose, scale: v(1, 1, 1) });
        if (distance !== null && (!nearest || distance < nearest.distance))
          nearest = { target: { marker }, distance };
      }
    return nearest;
  }

  /** Where the chosen object or marker is in the set-up, its box, and its handles. */
  private chosenPlace(): { transform: Transform; box: Box; places: HandlePlaces } | null {
    const target = this.chosenTarget;
    if (!target) return null;
    if ('marker' in target) {
      const pose = this.timeline.markerPlaces().get(target.marker);
      if (!pose) return null;
      const transform = asTransform(pose);
      return { transform, box: MARKER_BOX, places: handlePlaces(MARKER_BOX, transform, false) };
    }
    const view = this.views.get(target.object);
    if (!view) return null;
    const transform = this.timeline.transform(target.object);
    return { transform, box: view.box, places: handlePlaces(view.box, transform, true) };
  }

  /** A press on one of the chosen thing's handles, or on it, starts a drag. */
  private grab(x: number, y: number, id: number, shift: boolean): Gesture | null {
    if (!this.isEditing || !this.chosenTarget) return null;
    const chosen = this.chosenPlace();
    if (!chosen) return null;
    const view = this.viewing();
    const ray = this.rayAt(x, y);
    const target = this.chosenTarget;
    const start = 'object' in target ? this.timeline.placeInSetUp(target.object) : chosen.transform;
    const begin = (handle: Handle, grab: Vec3): Gesture => ({
      kind: 'drag',
      id,
      handle,
      target,
      start,
      last: start,
      grab: sub(grab, start.position),
      ray,
      x0: x,
      y0: y,
      shift,
      places: chosen.places,
      view,
      moved: false,
    });
    const handle = handleAt(chosen.places, view, x, y);
    if (handle) return begin(handle, chosen.places.ring.centre);
    const hit = this.hit(ray);
    if (!hit || !sameTarget(hit.target, target)) return null;
    return begin('move', add(ray.origin, scale(ray.direction, hit.distance)));
  }

  /** A drag that has moved: the set-up follows it at once, and listeners hear of it. */
  private dragTo(g: Drag, x: number, y: number, shift: boolean): void {
    const ray = this.rayAt(x, y);
    if (g.handle === 'move' && shift !== g.shift) {
      // Shift pressed or let go part-way: carry on from here, the other way.
      g.start = g.last;
      g.ray = ray;
      g.shift = shift;
    }
    const grab = add(g.start.position, g.grab);
    const next =
      g.handle === 'move'
        ? (g.shift ? moveUpDown : moveAlongGround)(g.start, grab, g.ray, ray)
        : g.handle === 'turn'
          ? turnAbout(g.start, g.places.ring, g.ray, ray)
          : resizeEvenly(g.start, g.places, g.view, g.x0, g.y0, x, y);
    if (!next) return;
    try {
      if ('object' in g.target) this.setObject(g.target.object, { transform: next });
      else this.setMarker(g.target.marker, next);
    } catch (e) {
      if (e instanceof StageError) return;
      throw e;
    }
    g.last = next;
    this.fireEdit({ target: g.target, transform: next, final: false });
  }

  /** How much of the scene Look around shows, top to bottom, in radians. */
  private viewFov(): number {
    return this.timeline.lens() * 2 * Math.PI;
  }

  /** Turns Look around's camera, which starts from wherever it is. */
  private orbit(change: (o: Orbit) => Orbit): void {
    const around = this.around;
    if (!around) return;
    const orbit = change(
      around.orbit ?? orbitFrom(around.view, this.timeline.ground(), this.subjects()),
    );
    this.around = { view: orbitView(orbit), orbit };
    this.showView();
  }

  /** The middles of what the scene's camera sees: Look around turns round them. */
  private subjects(): Vec3[] {
    return this.inShot().flatMap((id) => {
      const box = this.views.get(id)?.box;
      if (!box) return [];
      const t = this.timeline.transform(id);
      const middle = scale(add(box.min, box.max), 0.5);
      return [
        add(
          t.position,
          rotate(t.rotation, v(middle.x * t.scale.x, middle.y * t.scale.y, middle.z * t.scale.z)),
        ),
      ];
    });
  }

  private newViewCamera(): FreeCamera {
    const camera = new FreeCamera('look around', Vector3.Zero(), this.scene!, false);
    camera.minZ = NEAR;
    camera.maxZ = FAR;
    return camera;
  }

  /** Looks through Look around's camera or the scene's, and draws what's being edited. */
  private showView(): void {
    const scene = this.scene;
    if (!scene) return;
    const around = this.around;
    if (around && this.viewCamera) {
      const { position, rotation } = around.view;
      this.viewCamera.position.set(position.x, position.y, position.z);
      setRotation(this.viewCamera, mul(rotation, CAMERA_TURN));
      this.viewCamera.fov = this.timeline.lens() * 2 * Math.PI;
      scene.activeCamera = this.viewCamera;
    } else if (this.camera) scene.activeCamera = this.camera;
    if (!this.isEditing) {
      this.editView?.draw(null);
      return;
    }
    this.editView ??= new EditView(scene);
    const chosen = this.chosenPlace();
    const target = this.chosenTarget;
    const drawing: EditDrawing = {
      view: this.viewing(),
      chosen,
      markers: [...this.timeline.markerPlaces()].map(([id, pose]) => ({
        id,
        position: pose.position,
        rotation: pose.rotation,
        chosen: !!target && 'marker' in target && target.marker === id,
      })),
    };
    this.editView.draw(drawing);
  }

  /** Touch drags belong to the stage while it's editing or looking around, not to the page. */
  private touchAction(): void {
    const canvas = this.engine.getRenderingCanvas();
    if (canvas && 'style' in canvas)
      canvas.style.touchAction = this.isEditing || this.around ? 'none' : '';
  }
}

/** A box half as big again each way, round its middle: what a pose can reach beyond its rest. */
function grown(box: Box): Box {
  const middle = scale(add(box.min, box.max), 0.5);
  const half = scale(sub(box.max, box.min), 0.75);
  return { min: sub(middle, half), max: add(middle, half) };
}

/** How far a press can move and still be a tap, in CSS pixels. */
const TAP_SLOP = 6;
/** How much one notch of the wheel (100) brings Look around nearer: about a tenth. */
const WHEEL = 0.001;
/** Look around's keys, and the steps they take. */
const VIEW_KEYS: Readonly<Record<string, ViewStep>> = {
  ArrowLeft: 'circleLeft',
  ArrowRight: 'circleRight',
  ArrowUp: 'riseAndLookDown',
  ArrowDown: 'dropAndLookUp',
  '+': 'zoomIn',
  '=': 'zoomIn',
  '-': 'zoomOut',
};
/** With Shift held, the arrows pan. */
const PAN_KEYS: Readonly<Record<string, ViewStep>> = {
  ArrowLeft: 'panLeft',
  ArrowRight: 'panRight',
  ArrowUp: 'panUp',
  ArrowDown: 'panDown',
};

/** A handle being dragged. */
interface Drag {
  readonly kind: 'drag';
  readonly id: number;
  readonly handle: Handle;
  readonly target: EditTarget;
  /** Where it was when this stretch of the drag began, and where it is now. */
  start: Transform;
  last: Transform;
  /** Where it was taken hold of, from its place. */
  readonly grab: Vec3;
  /** The line of sight when this stretch began. */
  ray: Ray;
  readonly x0: number;
  readonly y0: number;
  shift: boolean;
  readonly places: HandlePlaces;
  readonly view: Viewing;
  moved: boolean;
}

/** What a pointer is doing on the view. */
type Gesture =
  | {
      readonly kind: 'press';
      readonly id: number;
      readonly x0: number;
      readonly y0: number;
      x: number;
      y: number;
      /** It pans once it moves (Shift or the right button), rather than circling. */
      readonly pan: boolean;
    }
  | { readonly kind: 'orbit'; readonly id: number; x: number; y: number }
  | { readonly kind: 'pan'; readonly id: number; x: number; y: number }
  | { readonly kind: 'pinch'; apart: number; middle: { x: number; y: number } }
  | Drag;

const sameTarget = (a: EditTarget, b: EditTarget) =>
  'object' in a ? 'object' in b && a.object === b.object : 'marker' in b && a.marker === b.marker;

/** A marker's place as a transform: its own size if the set-up gives one. */
function asTransform(pose: { readonly position: Vec3; readonly rotation: Quat }): Transform {
  const size = (pose as Partial<Transform>).scale;
  return { position: pose.position, rotation: pose.rotation, scale: size ?? v(1, 1, 1) };
}

/** What a scene is built from: a load that changes nothing here keeps the scene (`loadInPlace`). */
function placement(setup: SceneSetup): string {
  return JSON.stringify([setup.backdrop, setup.objects.map((o) => [o.id, o.model, o.class])]);
}

/** What a scene is drawn from: its timeline, and the views, sky, fade and camera it shows. */
interface Showing {
  readonly timeline: Timeline;
  readonly views: ReadonlyMap<ObjectId, ObjectView>;
  readonly showSky: ShowSky | null;
  readonly showFade: ((amount: number) => void) | null;
  readonly camera: FreeCamera | null;
}

/** A crossfade's old scene, drawn into `target` and laid over the new one by `layer`. */
interface Leaving extends Showing {
  readonly scene: Scene;
  readonly library: ModelLibrary;
  /** Its time when the new scene began, and how long the crossfade lasts. */
  readonly from: Micros;
  readonly duration: Micros;
  readonly target: RenderTargetTexture;
  readonly layer: Layer;
}

/** Copies a timeline's state onto its scene. */
function showScene(s: Showing): void {
  const state = s.timeline.current();
  for (const [id, view] of s.views) {
    const shown = s.timeline.shown(id);
    view.show(state.get(id)!, s.timeline.transform(id), {
      ...(shown.human ? { human: shown.human } : {}),
      ...(shown.turns ? { turns: shown.turns } : {}),
      clips: shown.own,
      face: shown.face,
      fading: shown.fading,
      blink: shown.blink,
    });
  }
  s.showSky?.(s.timeline.sky());
  s.showFade?.(s.timeline.fade());
  if (s.camera) {
    const { position, rotation } = s.timeline.transform(CAMERA);
    s.camera.position.set(position.x, position.y, position.z);
    setRotation(s.camera, mul(rotation, CAMERA_TURN));
    s.camera.fov = s.timeline.lens() * 2 * Math.PI;
  }
}

/**
 * Brings every node's place up to date for a picture. A render target doesn't do it as drawing a
 * frame does, so a stand-in's label, which turns to face the camera, was left where it was made
 * and missing from the picture (found by S2 in Compare). The camera goes first: a label turns to it.
 */
function placeForPicture(scene: Scene): void {
  scene.activeCamera?.computeWorldMatrix();
  scene.activeCamera?.getViewMatrix(true);
  for (const node of scene.transformNodes) node.computeWorldMatrix(true);
  for (const mesh of scene.meshes) mesh.computeWorldMatrix(true);
}

/**
 * Waits until a scene is ready to draw, or is dropped. Babylon.js never settles `whenReadyAsync`
 * for a scene disposed before it's ready, which left a load overtaken by a newer one waiting for
 * ever (found by S2).
 */
function readyOrGone(scene: Scene): Promise<void> {
  if (scene.isDisposed) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const gone = scene.onDisposeObservable.addOnce(() => resolve());
    scene.whenReadyAsync().then(
      () => {
        scene.onDisposeObservable.remove(gone);
        resolve();
      },
      (e: unknown) => {
        scene.onDisposeObservable.remove(gone);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** A stand-in has its class's joints, so code written for the real model still runs. */
function place(
  object: SceneObjectSetup,
  library: ModelLibrary,
  scene: Scene,
  missing: Missing[],
): PlacedModel | Promise<PlacedModel> {
  const standIn = (label: string, size?: Vec3): PlacedModel => {
    const skeleton = skeletonOf(object.class);
    return {
      view: buildStandIn(object.id, label, scene, standInBox(size)),
      shape: standInShape(skeleton ? jointsOf(skeleton).map((d) => d.id) : [], size),
    };
  };
  if (typeof object.model !== 'string') return standIn(object.model.standIn, object.model.size);
  const model = object.model;
  // A model that can't be had, or can't be placed, shows as a stand-in with its name, and the
  // scene plays on: one model never takes the rest of the scene with it.
  return library.place(object.id, model, object.class).catch((e: unknown) => {
    // Not having a model is ordinary. Anything else is a fault in the file or in the stage.
    if (!(e instanceof StageError && e.code === 'unknown_model'))
      Logger.Error(`The stage couldn't place ${model}: ${e instanceof Error ? e.message : e}`);
    missing.push({ kind: 'model', object: object.id, model });
    return standIn(model.split('/').pop() || model);
  });
}
