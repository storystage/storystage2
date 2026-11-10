/**
 * The real stage in a real browser, for what `NullEngine` can't show: pixels. Everything is on
 * `window.stageHarness` for the end-to-end test to call. Each run makes its own stage, so runs
 * can't affect each other.
 */
import {
  IDENTITY,
  backstageId,
  jointName,
  micros,
  objectId,
  type SceneSetup,
  type StageCommand,
  type StageEvent,
  type StageQuery,
} from '@storystage/story-api';
import grassCast from '../../../../tests/scenes/grass-cast.json';
import fadeOut from '../../../../tests/scenes/fade-out.json';
import roomCamera from '../../../../tests/scenes/room-camera.json';
import shots from '../../../../tests/scenes/shots.json';
import snowFog from '../../../../tests/scenes/snow-fog.json';
import { BACKDROP_TEMPLATES, resolveBackdrop } from '../../src/backdrops.ts';
import { createBabylonStage, type ModelSource } from '../../src/babylon/index.ts';
import { tinyHumanUrl, tinyModelUrl } from '../../src/babylon/tiny-model.ts';
import type { ObjectView } from '../../src/babylon/view.ts';
import { loadHumanLibrary } from '../../src/humanoid/library.ts';
import { sample as samplePose } from '../../src/humanoid/pose.ts';
import type { ObjectState } from '../../src/timeline.ts';

const W = 640;
const H = 360;
const FRAMES = 20;

interface ReferenceScene {
  readonly name: string;
  readonly seconds: number;
  readonly setup: SceneSetup;
  readonly commands: readonly StageCommand[];
}

const SCENES = {
  'grass-cast': grassCast,
  'snow-fog': snowFog,
  'room-camera': roomCamera,
  'fade-out': fadeOut,
  shots,
} as unknown as Readonly<Record<string, ReferenceScene>>;

const robot = backstageId('test/Biped/robot');
const robotFile = {
  url: tinyModelUrl(['hips', 'spine', 'chest', 'neck', 'head']),
  joints: [jointName('neck'), jointName('head')],
};
const models: ModelSource = { find: (id) => (id === robot ? robotFile : null) };

function offscreenStage() {
  const canvas = document.createElement('canvas'); // never attached to the page
  canvas.width = W;
  canvas.height = H;
  // WebGL2 everywhere, so the pixels checked here are the same on every machine.
  return createBabylonStage({ canvas, models, offscreen: true, renderer: 'webgl2' });
}

function fnv(bytes: Uint8ClampedArray) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

async function run(scene: ReferenceScene) {
  const stage = await offscreenStage();
  await stage.load(scene.setup);
  stage.schedule(scene.commands);
  const at = (f: number) => micros((f / (FRAMES - 1)) * scene.seconds);
  const pixels: number[] = [];
  const states: number[] = [];
  for (let f = 0; f < FRAMES; f++) {
    stage.seek(at(f));
    pixels.push(fnv((await stage.renderFrame()).data));
    states.push(stage.stateHash());
  }
  // Back to an earlier frame, after being at the end.
  stage.seek(at(5));
  const rewound = fnv((await stage.renderFrame()).data);
  stage.dispose();
  return { pixels, states, rewound };
}

/** A scene rendered twice at a fixed time step: do the runs match, frame for frame? */
async function determinism(name: string) {
  const scene = SCENES[name]!;
  const a = await run(scene);
  const b = await run(scene);
  return {
    frames: a.pixels.length,
    distinctFrames: new Set(a.pixels).size,
    pixelsIdentical: a.pixels.every((h, i) => h === b.pixels[i]),
    firstDifferentFrame: a.pixels.findIndex((h, i) => h !== b.pixels[i]),
    statesIdentical: a.states.every((h, i) => h === b.states[i]),
    rewindIdentical: a.rewound === a.pixels[5],
  };
}

const cat = objectId('cat');
const redCat: SceneSetup = {
  backdrop: {},
  objects: [
    {
      id: cat,
      model: { standIn: 'cat' },
      class: 'Quadruped',
      paint: 'red',
      transform: { ...IDENTITY, position: { x: 2, y: 0, z: 0 } },
    },
  ],
  camera: { transform: { ...IDENTITY, position: { x: 0, y: 0.5, z: -10 } } },
  markers: [],
};

/** Where a red object at +X lands in the picture, with the camera looking along +Z. */
async function direction() {
  const stage = await offscreenStage();
  await stage.load(redCat);
  const frame = await stage.renderFrame();
  stage.dispose();
  let count = 0;
  let across = 0;
  let down = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      if (frame.data[p]! > 120 && frame.data[p + 1]! < 60 && frame.data[p + 2]! < 60) {
        count++;
        across += x;
        down += y;
      }
    }
  return { count, meanX: across / count, meanY: down / count, width: W, height: H };
}

/** The top-left pixel of each template, with the sky it should be. */
async function skies() {
  const out = [];
  for (const template of BACKDROP_TEMPLATES) {
    if (template.id === 'room') continue;
    const stage = await offscreenStage();
    await stage.load({
      backdrop: template.backdrop,
      objects: [],
      camera: { transform: { ...IDENTITY, position: { x: 0, y: 1.5, z: -8 } } },
      markers: [],
    });
    const { data } = await stage.renderFrame();
    stage.dispose();
    const { r, g, b } = resolveBackdrop(template.backdrop).sky.atmosphere;
    out.push({
      id: template.id,
      got: [data[0]!, data[1]!, data[2]!],
      want: [r * 255, g * 255, b * 255],
    });
  }
  return out;
}

/** One frame of a reference scene, or of a template with the red cat in it. */
async function frameOf(name: string, seconds: number) {
  const scene = SCENES[name] ?? {
    name,
    seconds: 1,
    commands: [],
    setup: {
      backdrop: BACKDROP_TEMPLATES.find((t) => t.id === name)!.backdrop,
      objects: redCat.objects,
      camera: redCat.camera,
      markers: [],
    },
  };
  const stage = await offscreenStage();
  await stage.load(scene.setup);
  stage.schedule(scene.commands);
  stage.seek(micros(seconds));
  const frame = await stage.renderFrame();
  stage.dispose();
  return frame;
}

/** The same moment as `frameOf`, but taken with `picture` while the scene is at 0 (5.7). */
async function stillOf(name: string, seconds: number) {
  const scene = SCENES[name]!;
  const stage = await offscreenStage();
  await stage.load(scene.setup);
  stage.schedule(scene.commands);
  stage.seek(micros(0));
  const still = await stage.picture(micros(seconds), W, H);
  stage.dispose();
  return still;
}

/** The colour at one point of a frame. */
async function sample(name: string, seconds: number, x: number, y: number) {
  const { data } = await frameOf(name, seconds);
  const p = (y * W + x) * 4;
  return [data[p]!, data[p + 1]!, data[p + 2]!];
}

/** How many pixels of a frame are near black, which only a stand-in's label is. */
async function darkPixels(name: string, seconds: number, still = false) {
  const { data } = still ? await stillOf(name, seconds) : await frameOf(name, seconds);
  let count = 0;
  for (let p = 0; p < data.length; p += 4)
    if (data[p]! < 70 && data[p + 1]! < 70 && data[p + 2]! < 90) count++;
  return count;
}

/**
 * How much of a grass scene's frame is neither sky nor ground: what the camera has framed. The
 * grass template's sky and ground are flat colours (`backdrops.ts`).
 */
async function subjectShare(name: string, seconds: number) {
  const { data } = await frameOf(name, seconds);
  const near = (p: number, r: number, g: number, b: number) =>
    Math.abs(data[p]! - r) < 25 &&
    Math.abs(data[p + 1]! - g) < 25 &&
    Math.abs(data[p + 2]! - b) < 25;
  let count = 0;
  for (let p = 0; p < data.length; p += 4)
    if (!near(p, 150, 226, 252) && !near(p, 0x5f, 0x9e, 0x3a)) count++;
  return count / (W * H);
}

/** A frame as a PNG, for people to look at; or, with `still`, a picture of that moment. */
async function picture(name: string, seconds: number, still = false) {
  const frame = still ? await stillOf(name, seconds) : await frameOf(name, seconds);
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const image = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * WP5.7: a picture of a moment, taken while the scene is at another, against the frame drawn at
 * that moment, and a small picture's top and bottom rows: sky above, ground below.
 */
async function pictureCheck() {
  const scene = SCENES['grass-cast']!;
  const stage = await offscreenStage();
  await stage.load(scene.setup);
  stage.schedule(scene.commands);
  stage.seek(micros(0.5));
  const picture = await stage.picture(micros(2), W, H);
  const time = stage.time();
  stage.seek(micros(2));
  const frame = await stage.renderFrame();
  let differ = 0;
  for (let p = 0; p < frame.data.length; p += 4)
    if (
      Math.abs(frame.data[p]! - picture.data[p]!) +
        Math.abs(frame.data[p + 1]! - picture.data[p + 1]!) >
      24
    )
      differ++;
  const small = await stage.picture(micros(2), 160, 90);
  const pixel = (y: number) => Array.from(small.data.slice(y * 160 * 4 + 320, y * 160 * 4 + 323));
  stage.dispose();
  return { time, differ: differ / (W * H), top: pixel(2), bottom: pixel(87) };
}

/**
 * A stage made as the studio makes one, with the renderer chosen for the device: which it got,
 * how big it draws, and whether anything was drawn.
 */
async function rendering(renderer: 'auto' | 'webgl2', quality: 'low' | 'standard') {
  // On the page, as the studio's is: Babylon.js sizes its drawing from the canvas's size there.
  const canvas = document.createElement('canvas');
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  document.body.append(canvas);
  const stage = await createBabylonStage({ canvas, models, renderer, quality });
  await stage.load(redCat);
  const frame = await stage.renderFrame();
  let lit = 0;
  for (let p = 0; p < frame.data.length; p += 4)
    if (frame.data[p]! + frame.data[p + 1]! > 60) lit++;
  const result = {
    renderer: stage.renderer,
    gpu: 'gpu' in navigator,
    width: frame.width,
    height: frame.height,
    lit: lit / (frame.width * frame.height),
  };
  stage.dispose();
  canvas.remove();
  return result;
}

/** Live on the page's canvas: the real input path, and frames drawn against the clock. */
async function goLive() {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const stage = await createBabylonStage({ canvas, models, renderer: 'webgl2' });
  const setup = { ...redCat, objects: [{ ...redCat.objects[0]!, transform: IDENTITY }] };
  await stage.load(setup);
  const heard: StageEvent[] = [];
  stage.onEvent((e) => heard.push(e));
  let frames = 0;
  const start = performance.now();
  const clock = () => micros((performance.now() - start) / 1000);
  stage.startLive(() => {
    stage.seek(clock());
    frames++;
  });
  Object.assign(window, {
    stageLive: {
      heard: () => heard,
      frames: () => frames,
      time: () => stage.time(),
      stop: () => stage.stopLive(),
    },
  });
}

/**
 * What view and occlusion events would cost each frame, in microseconds, for decision 0051.
 * Alice's tests, on boxes round the objects: view projects each box's eight corners through the
 * camera, and occlusion also compares the picture rectangles of every pair. Nothing is drawn.
 * On a reference device, open this page and call `stageHarness.eventCost(30)` in the console.
 */
function eventCost(objects: number) {
  const scale = H / (2 * Math.tan(0.25));
  const corner = (o: number, i: number) => {
    const x = (o % 6) - 3 + (i & 1 ? 0.25 : -0.25);
    const y = i & 2 ? 1 : 0;
    const z = Math.floor(o / 6) * 2 + (i & 4 ? 0.25 : -0.25) + 8;
    return { x: W / 2 - (x / z) * scale, y: H / 2 - ((y - 1) / z) * scale, inFront: z > 0 };
  };
  const rectangles = () => {
    const out = [];
    for (let o = 0; o < objects; o++) {
      let left = Infinity;
      let right = -Infinity;
      let top = Infinity;
      let bottom = -Infinity;
      for (let i = 0; i < 8; i++) {
        const p = corner(o, i);
        left = Math.min(left, p.x);
        right = Math.max(right, p.x);
        top = Math.min(top, p.y);
        bottom = Math.max(bottom, p.y);
      }
      out.push({ left, right, top, bottom });
    }
    return out;
  };
  const inView = (r: ReturnType<typeof rectangles>[number]) =>
    r.left < W && r.right > 0 && r.top < H && r.bottom > 0;
  const occluding = (list: ReturnType<typeof rectangles>) => {
    let found = 0;
    for (let a = 0; a < list.length; a++)
      for (let b = a + 1; b < list.length; b++) {
        const p = list[a]!;
        const q = list[b]!;
        if (p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom) found++;
      }
    return found;
  };
  const RUNS = 2000;
  const time = (work: () => number) => {
    let sink = 0;
    const start = performance.now();
    for (let i = 0; i < RUNS; i++) sink += work();
    const each = ((performance.now() - start) / RUNS) * 1000;
    return sink >= 0 ? each : 0;
  };
  // The first pass runs before the browser has optimised the code, so it's thrown away.
  const average = (work: () => number) => {
    time(work);
    return time(work);
  };
  return {
    objects,
    pairs: (objects * (objects - 1)) / 2,
    view: average(() => rectangles().filter(inView).length),
    occlusion: average(() => occluding(rectangles())),
  };
}

/**
 * WP4.6: a humanoid in one of the shared clips' poses, `seconds` in, from the front and a
 * little to its left. With no `url`, the small humanoid in `tiny-model.ts`. For looking at
 * how a clip plays on a model it wasn't made on.
 */
async function humanPicture(
  clip: string,
  seconds: readonly number[],
  url: string = tinyHumanUrl(),
  joints: readonly string[] = [],
) {
  const id = objectId('person');
  const person = backstageId('test/Biped/person');
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const stage = await createBabylonStage({
    canvas,
    models: { find: (b) => (b === person ? { url, joints: joints.map(jointName) } : null) },
    offscreen: true,
    renderer: 'webgl2',
  });
  await stage.load({
    backdrop: BACKDROP_TEMPLATES.find((t) => t.id === 'grass')!.backdrop,
    objects: [{ id, model: person, class: 'Biped', transform: IDENTITY }],
    camera: { transform: IDENTITY },
    markers: [],
  });
  stage.schedule([
    {
      seq: 1,
      object: objectId('camera'),
      start: 0,
      duration: 0,
      style: 'beginAndEndAbruptly',
      kind: 'shot',
      shot: 'wide',
      targets: [id],
    },
  ]);
  stage.seek(micros(0.01));
  const inside = stage as unknown as {
    views: Map<string, ObjectView>;
    timeline: { need(o: string): ObjectState; transform(o: string): typeof IDENTITY };
  };
  const view = inside.views.get(id)!;
  const library = await loadHumanLibrary();
  const out = [];
  for (const s of seconds) {
    const human = samplePose(library.get(clip)!, s);
    view.show(inside.timeline.need(id), inside.timeline.transform(id), { human });
    const frame = await stage.renderFrame();
    const c = document.createElement('canvas');
    c.width = frame.width;
    c.height = frame.height;
    c.getContext('2d')!.putImageData(
      new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height),
      0,
      0,
    );
    out.push(c.toDataURL('image/png'));
  }
  stage.dispose();
  return out;
}

/**
 * WP4c: any scene, with its models given by address, its commands run, and a picture at each of
 * `seconds`. For looking at the character actions on real models.
 */
async function scenePictures(
  setup: SceneSetup,
  commands: readonly StageCommand[],
  seconds: readonly number[],
  files: Readonly<Record<string, { url: string; joints: readonly string[] }>>,
  quality: 'low' | 'standard' = 'standard',
) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const stage = await createBabylonStage({
    canvas,
    models: {
      find: (id) => {
        const file = files[id];
        return file ? { url: file.url, joints: file.joints.map(jointName) } : null;
      },
    },
    offscreen: true,
    renderer: 'webgl2',
    quality,
  });
  // A backdrop may be named by its template.
  const backdrop = setup.backdrop as unknown;
  if (typeof backdrop === 'string')
    setup = { ...setup, backdrop: BACKDROP_TEMPLATES.find((t) => t.id === backdrop)!.backdrop };
  await stage.load(setup);
  // A duration below zero means the action's own, from naturalDuration, as a block asks for it.
  for (const c of commands) {
    const { seq, start, duration, style, ...action } = c;
    void seq;
    void style;
    const own =
      duration < 0
        ? (stage.answer({ kind: 'naturalDuration', action, at: start } as StageQuery)
            .value as number)
        : duration;
    stage.schedule([{ ...c, duration: own }]);
  }
  const out = [];
  for (const s of seconds) {
    stage.seek(micros(s));
    const frame = await stage.renderFrame();
    const c = document.createElement('canvas');
    c.width = frame.width;
    c.height = frame.height;
    c.getContext('2d')!.putImageData(
      new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height),
      0,
      0,
    );
    out.push(c.toDataURL('image/png'));
  }
  stage.dispose();
  return out;
}

/**
 * WP8.3: the sky's colour, top left, through a one-second crossfade from the grass template's
 * light blue sky to the moon's near black: at its start, half way and at its end.
 */
async function crossfadeSky() {
  const stage = await offscreenStage();
  const setup = (template: string): SceneSetup => ({
    backdrop: BACKDROP_TEMPLATES.find((t) => t.id === template)!.backdrop,
    objects: [],
    camera: redCat.camera,
    markers: [],
  });
  await stage.load(setup('grass'));
  const pixel = async () => {
    const frame = await stage.renderFrame();
    const p = (5 * W + 5) * 4;
    return [frame.data[p]!, frame.data[p + 1]!, frame.data[p + 2]!];
  };
  const out: number[][] = [await pixel()];
  await stage.load(setup('moon'), { crossfade: micros(1) });
  for (const t of [0, 0.5, 1]) {
    stage.seek(micros(t));
    out.push(await pixel());
  }
  stage.dispose();
  return out;
}

/** Milliseconds: the mean, and the slowest but one in twenty. */
function spread(times: readonly number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((s, t) => s + t, 0) / Math.max(1, times.length);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
  return { mean: Math.round(mean * 100) / 100, p95: Math.round(p95 * 100) / 100 };
}

/**
 * WP4c and WP8.3: what characters cost each frame. `count` humanoids (the small one in
 * `tiny-model.ts`, or the model at `url`) stand, then walk round a wall looking at the first
 * of them, every third one waving, then crossfade into a second scene of the same. For each, at
 * 30 frames a second for `seconds`:
 * - `seek`: the stage's own work (timeline, poses, views), in milliseconds;
 * - `render`: handing the frame to the GPU;
 * - `frame`: the whole frame, the GPU's drawing included.
 *
 * Also how long the scene took to load, and to work out every walk (its walkable area included).
 * On a reference device, open this page and call `stageHarness.characterCost(10)` (#6).
 */
async function characterCost(
  count = 10,
  seconds = 2,
  url: string = tinyHumanUrl(),
  renderer: 'auto' | 'webgl2' = 'webgl2',
) {
  const canvas = document.createElement('canvas');
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  document.body.append(canvas);
  const person = backstageId('test/Biped/person');
  const stage = await createBabylonStage({
    canvas,
    models: { find: (id) => (id === person ? { url, joints: [] } : null) },
    renderer,
  });
  const ids = Array.from({ length: count }, (_, i) => objectId(`p${i}`));
  const setup: SceneSetup = {
    backdrop: BACKDROP_TEMPLATES.find((t) => t.id === 'grass')!.backdrop,
    objects: [
      ...ids.map((id, i) => ({
        id,
        model: person,
        class: 'Biped' as const,
        transform: {
          ...IDENTITY,
          position: { x: ((i % 5) - 2) * 1.5, y: 0, z: Math.floor(i / 5) * 1.5 },
        },
      })),
      {
        id: objectId('wall'),
        model: { standIn: 'wall', size: { x: 6, y: 2, z: 0.3 } },
        class: 'Prop' as const,
        transform: { ...IDENTITY, position: { x: 0, y: 0, z: 9 } },
      },
    ],
    camera: { transform: { ...IDENTITY, position: { x: 0, y: 2, z: -8 } } },
    markers: [
      { id: objectId('beyond'), transform: { ...IDENTITY, position: { x: 0, y: 0, z: 14 } } },
    ],
  };
  const inside = stage as unknown as {
    scene: { render(): void };
    engine: { readPixels(x: number, y: number, w: number, h: number): Promise<unknown> };
  };
  const run = async (from: number) => {
    const seek: number[] = [];
    const render: number[] = [];
    const frames = Math.round(seconds * 30);
    // A few frames first, unmeasured: the first ones also compile shaders.
    for (let f = 0; f < 5; f++) {
      stage.seek(micros(from));
      inside.scene.render();
    }
    await inside.engine.readPixels(0, 0, 1, 1);
    const start = performance.now();
    for (let f = 0; f < frames; f++) {
      const a = performance.now();
      stage.seek(micros(from + f / 30));
      const b = performance.now();
      inside.scene.render();
      render.push(performance.now() - b);
      seek.push(b - a);
    }
    // Waits for the GPU to finish what it was given.
    await inside.engine.readPixels(0, 0, 1, 1);
    return {
      seek: spread(seek),
      render: spread(render),
      frame: Math.round(((performance.now() - start) / frames) * 100) / 100,
    };
  };
  let seq = 0;
  const command = (c: object, start: number): StageCommand => {
    const timed = {
      seq: seq++,
      start: micros(start),
      duration: 0,
      style: 'beginAndEndGently',
      ...c,
    } as StageCommand;
    const { seq: _s, start: at, duration: _d, style: _st, ...action } = timed;
    void _s;
    void _d;
    void _st;
    const own = stage.answer({ kind: 'naturalDuration', action, at } as StageQuery).value as number;
    return { ...timed, duration: Math.max(own, micros(1)) };
  };

  const loadStart = performance.now();
  await stage.load(setup);
  const loadMs = Math.round(performance.now() - loadStart);
  const standing = await run(0);

  const planning = performance.now();
  const acting: StageCommand[] = [];
  ids.forEach((id, i) => {
    acting.push(command({ object: id, kind: 'walk', to: objectId('beyond'), gait: 'walk' }, 3));
    if (i > 0) acting.push(command({ object: id, kind: 'lookAt', target: ids[0]! }, 3));
    if (i % 3 === 0) acting.push(command({ object: id, kind: 'gesture', gesture: 'wave' }, 3));
  });
  stage.schedule(acting);
  // Working out every walk's way round the wall, its walkable area included, and scheduling it.
  const planMs = Math.round(performance.now() - planning);
  const walking = await run(3.6);

  await stage.load(setup, { crossfade: micros(seconds + 1) });
  const crossfade = await run(0);

  // Which GPU drew it: software (SwiftShader) in CI, the device's own otherwise.
  const gpu =
    (inside.engine as unknown as { getGlInfo?(): { renderer: string } }).getGlInfo?.().renderer ??
    '';
  stage.dispose();
  canvas.remove();
  return { count, renderer: stage.renderer, gpu, loadMs, planMs, standing, walking, crossfade };
}

/**
 * The same scene drawn by the renderer `auto` picks (WebGPU where the device has it) and by
 * WebGL2, read back by `renderFrame` and by `picture`: how far apart they are, on average,
 * in each colour (0 to 255), and the top and bottom rows' colours. Where there's no WebGPU,
 * `auto` is WebGL2, so they're the same.
 */
async function renderersAgree() {
  const frames = async (renderer: 'auto' | 'webgl2') => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const stage = await createBabylonStage({ canvas, models, offscreen: true, renderer });
    // Sky above and grass below, so a picture upside down can't pass.
    const grass = BACKDROP_TEMPLATES.find((t) => t.id === 'grass')!.backdrop;
    await stage.load({ ...redCat, backdrop: grass });
    const frame = await stage.renderFrame();
    const picture = await stage.picture(0, W, H);
    const used = stage.renderer;
    stage.dispose();
    return { used, frame: frame.data, picture: picture.data };
  };
  const a = await frames('auto');
  const b = await frames('webgl2');
  const apart = (x: Uint8ClampedArray, y: Uint8ClampedArray) => {
    let sum = 0;
    for (let p = 0; p < x.length; p += 4)
      sum +=
        Math.abs(x[p]! - y[p]!) + Math.abs(x[p + 1]! - y[p + 1]!) + Math.abs(x[p + 2]! - y[p + 2]!);
    return sum / ((x.length / 4) * 3);
  };
  const at = (data: Uint8ClampedArray, row: number) => {
    const p = (row * W + Math.floor(W / 2)) * 4;
    return [data[p]!, data[p + 1]!, data[p + 2]!];
  };
  return {
    renderer: a.used,
    frame: apart(a.frame, b.frame),
    picture: apart(a.picture, b.picture),
    top: { auto: at(a.frame, 2), webgl2: at(b.frame, 2) },
    bottom: { auto: at(a.frame, H - 3), webgl2: at(b.frame, H - 3) },
  };
}

/** What the page loaded, in bytes before compression, in order. */
function scripts() {
  return performance
    .getEntriesByType('resource')
    .filter((r) => r.name.endsWith('.js'))
    .map((r) => ({
      name: r.name.split('/').pop(),
      bytes: (r as PerformanceResourceTiming).decodedBodySize,
    }));
}

Object.assign(window, {
  stageHarness: {
    determinism,
    direction,
    skies,
    sample,
    darkPixels,
    subjectShare,
    rendering,
    pictureCheck,
    eventCost,
    characterCost,
    renderersAgree,
    picture,
    humanPicture,
    scenePictures,
    crossfadeSky,
    goLive,
    scripts,
  },
});
document.title = 'Stage harness ready';
