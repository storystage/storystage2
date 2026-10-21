/**
 * Spike 1.2: how many rigged characters, of what size, a device can animate smoothly.
 *
 * "Run the budget sweep" builds scenes from generated characters (rigs.ts) at four sizes and
 * measures each one. "Open a model" loads a .glb from this device (for example an Alice model
 * converted by tools/convert-alice-models) and animates its head and walk the same way. The file
 * is read locally and never uploaded: Alice's models aren't cleared for publishing (WP17.1).
 * Results go on the page and on `window.spikeResult`; add `?auto=1` to run the sweep at once.
 */
import '@babylonjs/loaders/glTF';
import {
  ArcRotateCamera,
  Bone,
  Color4,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  SceneInstrumentation,
  SceneLoader,
  Vector3,
} from '@babylonjs/core';
import { animate, makeCharacter, makeProp, type Character, type RigKind } from './rigs.ts';

interface Preset {
  id: string;
  /** Triangles per character. */
  triangles: number;
  rigs: RigKind[];
  textureSize: number;
  cast: number;
  props: number;
}

/** From a small scene to a crowded one; the WP3.9 budgets come from where these break down. */
export const PRESETS: Preset[] = [
  {
    id: 'small',
    triangles: 5_000,
    rigs: ['biped', 'quadruped'],
    textureSize: 512,
    cast: 3,
    props: 5,
  },
  {
    id: 'medium',
    triangles: 20_000,
    rigs: ['biped', 'quadruped'],
    textureSize: 1024,
    cast: 5,
    props: 10,
  },
  {
    id: 'large',
    triangles: 50_000,
    rigs: ['bipedWithFingers', 'quadruped'],
    textureSize: 2048,
    cast: 5,
    props: 10,
  },
  {
    id: 'crowd',
    triangles: 20_000,
    rigs: ['biped', 'quadruped'],
    textureSize: 1024,
    cast: 12,
    props: 20,
  },
];

const out = () => document.getElementById('out')!;
const say = (text: string) => (out().textContent = text);
const canvas = () => document.getElementById('stage') as HTMLCanvasElement;
/** Browsers slow a page down to about one frame a second when it isn't in view, which would make
 * every number meaningless; so each measurement records whether the page was hidden at any point. */
let hiddenCount = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenCount++;
});
const jsHeapMb = () => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1e5) / 10 : null;
};

function newScene(engine: Engine) {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.75, 0.85, 0.95, 1);
  const camera = new ArcRotateCamera(
    'camera',
    -Math.PI / 2,
    1.15,
    9,
    new Vector3(0, 0.8, 0),
    scene,
  );
  camera.attachControl(canvas(), true);
  new HemisphericLight('light', new Vector3(0.3, 1, -0.4), scene);
  MeshBuilder.CreateGround('ground', { width: 20, height: 20 }, scene);
  return scene;
}

/** Renders for `seconds` and returns frame statistics. Needs the page in view (see M1 script). */
function measure(engine: Engine, scene: Scene, seconds: number, onFrame: (t: number) => void) {
  return new Promise<{
    fps: number;
    medianMs: number;
    p95Ms: number;
    worstMs: number;
    stutters: number;
    drawCalls: number;
    valid: boolean;
  }>((resolve) => {
    const inst = new SceneInstrumentation(scene);
    inst.captureFrameTime = true;
    const hiddenAtStart = hiddenCount;
    const wasHidden = document.visibilityState === 'hidden';
    const intervals: number[] = [];
    let last = performance.now();
    const start = last;
    let drawCalls = 0;
    engine.runRenderLoop(() => {
      const now = performance.now();
      intervals.push(now - last);
      last = now;
      onFrame((now - start) / 1000);
      scene.render();
      drawCalls = Math.max(drawCalls, inst.drawCallsCounter.current);
      if (now - start > seconds * 1000) {
        engine.stopRenderLoop();
        inst.dispose();
        const sorted = intervals.slice(1).sort((a, b) => a - b);
        const at = (p: number) =>
          sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
        const r = (n: number) => Math.round(n * 10) / 10;
        resolve({
          fps: r(sorted.length / seconds),
          medianMs: r(at(0.5)),
          p95Ms: r(at(0.95)),
          worstMs: r(sorted.at(-1) ?? 0),
          stutters: sorted.filter((x) => x > 50).length,
          drawCalls,
          // Hidden at any point, or throttled to about one frame a second: don't use these numbers.
          valid: !wasHidden && hiddenCount === hiddenAtStart && at(0.5) < 500,
        });
      }
    });
  });
}

async function runPreset(engine: Engine, p: Preset) {
  const t0 = performance.now();
  const scene = newScene(engine);
  const cast: Character[] = [];
  for (let i = 0; i < p.cast; i++) {
    const c = makeCharacter(
      scene,
      p.rigs[i % p.rigs.length]!,
      p.triangles,
      p.textureSize,
      (i * 53) % 360,
    );
    c.mesh.position.set(((i % 4) - 1.5) * 1.6, 0, Math.floor(i / 4) * 1.6 - 1);
    cast.push(c);
  }
  for (let i = 0; i < p.props; i++)
    makeProp(scene, 500, i).position.set(((i % 5) - 2) * 2, 0.3, 4 + Math.floor(i / 5));
  await scene.whenReadyAsync();
  const buildMs = Math.round(performance.now() - t0);
  const triangles = cast.reduce((n, c) => n + c.triangles, 0) + p.props * 500;
  const vertices = cast.reduce((n, c) => n + c.vertices, 0);
  // Position, normal, UV, two bone indices and weights per vertex; 4-byte indices; RGBA textures with mipmaps.
  const gpuMb =
    Math.round(
      ((vertices * (12 + 12 + 8 + 16 + 16) +
        triangles * 3 * 4 +
        p.cast * p.textureSize ** 2 * 4 * 1.33) /
        1e6) *
        10,
    ) / 10;
  const walk = (t: number) => cast.forEach((c, i) => animate(c, t + i * 0.3));
  await measure(engine, scene, 1, walk); // warm up
  const frames = await measure(engine, scene, 5, walk);
  const result = {
    preset: p,
    buildMs,
    triangles,
    bones: cast.reduce((n, c) => n + c.bones.size, 0),
    estimatedGpuMb: gpuMb,
    jsHeapMb: jsHeapMb(),
    ...frames,
  };
  scene.dispose();
  return result;
}

async function sweep() {
  const engine = new Engine(canvas(), true, { stencil: false });
  const results: unknown[] = [];
  for (const p of PRESETS) {
    say(
      `Measuring “${p.id}” (${results.length + 1} of ${PRESETS.length})…  Keep this page in view.`,
    );
    results.push(await runPreset(engine, p));
  }
  const invalid = (results as { valid: boolean; preset: Preset }[])
    .filter((r) => !r.valid)
    .map((r) => r.preset.id);
  const summary = {
    warning: invalid.length
      ? `The page was hidden or slowed down while measuring ${invalid.join(', ')}: run the sweep again, keeping the page in view.`
      : null,
    userAgent: navigator.userAgent,
    renderer: engine.getGlInfo(),
    webgl: engine.webGLVersion,
    results,
  };
  engine.dispose();
  say(JSON.stringify(summary, null, 2));
  (window as unknown as { spikeResult: unknown }).spikeResult = summary;
}

/** Loads a model from this device and animates its head and walk by joint name. */
async function openModel(file: File) {
  say(`Opening ${file.name}…`);
  const engine = new Engine(canvas(), true, { stencil: false });
  const scene = newScene(engine);
  const t0 = performance.now();
  const imported = await SceneLoader.ImportMeshAsync('', '', file, scene);
  await scene.whenReadyAsync();
  const loadMs = Math.round(performance.now() - t0);
  const bones = new Map<string, Bone>();
  for (const s of imported.skeletons) for (const b of s.bones) bones.set(b.name, b);
  // Converted models may use Alice's names (HEAD, LEFT_HIP) or VRM names (head, leftUpperLeg).
  const alias: Record<string, string[]> = {
    head: ['head', 'HEAD', 'Head'],
    leftUpperLeg: ['leftUpperLeg', 'LEFT_HIP', 'LeftUpLeg'],
    rightUpperLeg: ['rightUpperLeg', 'RIGHT_HIP', 'RightUpLeg'],
    leftLowerLeg: ['leftLowerLeg', 'LEFT_KNEE', 'LeftLeg'],
    rightLowerLeg: ['rightLowerLeg', 'RIGHT_KNEE', 'RightLeg'],
  };
  const mapped = new Map<string, Bone>();
  for (const [id, names] of Object.entries(alias)) {
    const b = names.map((n) => bones.get(n)).find(Boolean);
    if (b) mapped.set(id, b);
  }
  const triangles = imported.meshes.reduce((n, m) => n + (m.getTotalIndices?.() ?? 0) / 3, 0);
  const frames = await measure(engine, scene, 5, (t) => animate({ bones: mapped }, t));
  const result = {
    file: file.name,
    sizeMb: Math.round(file.size / 1e5) / 10,
    loadMs,
    triangles: Math.round(triangles),
    joints: [...bones.keys()],
    animated: [...mapped.keys()],
    jsHeapMb: jsHeapMb(),
    ...frames,
  };
  engine.dispose();
  say(JSON.stringify(result, null, 2));
  (window as unknown as { spikeResult: unknown }).spikeResult = result;
}

document.getElementById('sweep')!.addEventListener('click', () => void sweep());
document.getElementById('file')!.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void openModel(file);
});
if (new URLSearchParams(location.search).has('auto')) void sweep();
