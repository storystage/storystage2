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
} from '@storystage/story-api';
import grassCast from '../../../../tests/scenes/grass-cast.json';
import fadeOut from '../../../../tests/scenes/fade-out.json';
import roomCamera from '../../../../tests/scenes/room-camera.json';
import snowFog from '../../../../tests/scenes/snow-fog.json';
import { BACKDROP_TEMPLATES, resolveBackdrop } from '../../src/backdrops.ts';
import { createBabylonStage, type ModelSource } from '../../src/babylon/index.ts';
import { tinyModelUrl } from '../../src/babylon/tiny-model.ts';

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
  return createBabylonStage({ canvas, models, offscreen: true });
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
  const stage = offscreenStage();
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
  const stage = offscreenStage();
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
    const stage = offscreenStage();
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
  const stage = offscreenStage();
  await stage.load(scene.setup);
  stage.schedule(scene.commands);
  stage.seek(micros(seconds));
  const frame = await stage.renderFrame();
  stage.dispose();
  return frame;
}

/** The colour at one point of a frame. */
async function sample(name: string, seconds: number, x: number, y: number) {
  const { data } = await frameOf(name, seconds);
  const p = (y * W + x) * 4;
  return [data[p]!, data[p + 1]!, data[p + 2]!];
}

/** How many pixels of a frame are near black, which only a stand-in's label is. */
async function darkPixels(name: string, seconds: number) {
  const { data } = await frameOf(name, seconds);
  let count = 0;
  for (let p = 0; p < data.length; p += 4)
    if (data[p]! < 70 && data[p + 1]! < 70 && data[p + 2]! < 90) count++;
  return count;
}

/** A frame as a PNG, for people to look at. */
async function picture(name: string, seconds: number) {
  const frame = await frameOf(name, seconds);
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const image = new ImageData(new Uint8ClampedArray(frame.data), frame.width, frame.height);
  canvas.getContext('2d')!.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Live on the page's canvas: the real input path, and frames drawn against the clock. */
async function goLive() {
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const stage = createBabylonStage({ canvas, models });
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
    eventCost,
    picture,
    goLive,
    scripts,
  },
});
document.title = 'Stage harness ready';
