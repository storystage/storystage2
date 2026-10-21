/**
 * Spike 1.4: the main thread. Babylon.js draws the scene; the worker sends the commands.
 * Results go on `window.spikeResult` for the Playwright run and on the page for people.
 */
import {
  Color3,
  Color4,
  Engine,
  FreeCamera,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import { SAMPLE } from './program.ts';
import { hashState, stateAt, US, type Command } from './scheduler.ts';
import type { FromWorker, ToWorker } from './worker.ts';

const wall = () => performance.timeOrigin + performance.now();
const SECONDS = 4;

function makeStage(canvas: HTMLCanvasElement) {
  const engine = new Engine(canvas, false, { preserveDrawingBuffer: true, stencil: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.95, 0.95, 0.95, 1);
  const camera = new FreeCamera('camera', new Vector3(0, 4, -8), scene);
  camera.setTarget(new Vector3(0, 0, 1));
  new HemisphericLight('light', new Vector3(0.3, 1, -0.5), scene);
  MeshBuilder.CreateGround('ground', { width: 10, height: 10 }, scene);
  const meshes: Record<string, Mesh> = {};
  SAMPLE.objects.forEach((o, i) => {
    const body = MeshBuilder.CreateBox(o.name, { width: 0.6, height: 0.6, depth: 0.9 }, scene);
    const nose = MeshBuilder.CreateBox(`${o.name}-nose`, { size: 0.2 }, scene);
    nose.parent = body;
    nose.position.z = 0.5;
    const m = new StandardMaterial(`${o.name}-m`, scene);
    m.diffuseColor = i === 0 ? new Color3(0.9, 0.5, 0.1) : new Color3(0.2, 0.4, 0.9);
    body.material = m;
    meshes[o.name] = body;
  });
  const apply = (commands: readonly Command[], tUs: number) => {
    const state = stateAt(SAMPLE, commands, tUs);
    for (const [name, s] of Object.entries(state)) {
      const mesh = meshes[name]!;
      mesh.position.set(s.x, 0.3 + s.y, s.z);
      mesh.rotation.y = s.heading * 2 * Math.PI;
    }
    return state;
  };
  return { engine, scene, apply };
}

function fnv(bytes: Uint8Array, hash = 0x811c9dc5) {
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i]!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Starts the worker and resolves once it has loaded (its `ready` message). */
const worker = () =>
  new Promise<Worker>((resolve) => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      if (e.data.type === 'ready') resolve(w);
    };
  });
const ask = (w: Worker, msg: ToWorker) =>
  new Promise<FromWorker>((resolve) => {
    w.onmessage = (e: MessageEvent<FromWorker>) => resolve(e.data);
    w.postMessage(msg);
  });

/** Fixed time step: 60 frames at 30 fps, rendered offscreen, pixels and scene state hashed. */
async function fixedStep() {
  const w = await worker();
  const reply = await ask(w, { type: 'timeline', seconds: SECONDS });
  w.terminate();
  if (reply.type !== 'timeline') throw new Error('unexpected reply');
  const canvas = document.createElement('canvas'); // never attached to the page
  canvas.width = 640;
  canvas.height = 360;
  const run = async (waitForReady: boolean) => {
    const { engine, scene, apply } = makeStage(canvas);
    // Babylon.js compiles shaders asynchronously: frames drawn before the scene is ready differ
    // from run to run. Offscreen export must wait for this (WP5.5, WP11.3).
    if (waitForReady) await scene.whenReadyAsync();
    const pixels: number[] = [];
    const states: number[] = [];
    for (let f = 0; f < 60; f++) {
      states.push(hashState(apply(reply.commands, Math.round((f / 30) * US))));
      scene.render();
      const data = (await engine.readPixels(0, 0, canvas.width, canvas.height)) as Uint8Array;
      pixels.push(fnv(data));
    }
    engine.dispose();
    return { pixels, states };
  };
  const compare = (a: { pixels: number[]; states: number[] }, b: typeof a) => ({
    pixelsIdentical: a.pixels.every((h, i) => h === b.pixels[i]),
    firstDifferentFrame: a.pixels.findIndex((h, i) => h !== b.pixels[i]),
    statesIdentical: a.states.every((h, i) => h === b.states[i]),
    distinctFrames: new Set(a.pixels).size,
  });
  // Run without waiting first, to record whether the shader warm-up really is the cause.
  const cold = compare(await run(false), await run(false));
  const a = await run(true);
  const b = await run(true);
  return {
    commands: reply.commands.length,
    computeMs: reply.computeMs,
    ...compare(a, b),
    withoutWaiting: cold,
  };
}

/** Live: the worker paces the scheduler by the wall clock; measure how early commands arrive. */
async function live(canvas: HTMLCanvasElement, lookahead: number) {
  const w = await worker();
  return new Promise<{
    commands: number;
    worstMarginMs: number;
    lateCommands: number;
    fps: number;
  }>((resolve) => {
    const { engine, scene, apply } = makeStage(canvas);
    const received: Command[] = [];
    let worstMargin = Infinity;
    let late = 0;
    let frames = 0;
    const t0 = wall() + 20; // the worker has loaded, so only message time is left
    let done = false;
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type !== 'commands') return;
      const arrived = wall();
      for (const c of m.commands) {
        const margin = t0 + c.start / 1000 - arrived; // > 0: arrived before it was due
        worstMargin = Math.min(worstMargin, margin);
        if (margin < 0) late++;
        received.push(c);
      }
      done ||= m.done;
    };
    w.postMessage({ type: 'live', t0, lookahead, seconds: SECONDS } satisfies ToWorker);
    engine.runRenderLoop(() => {
      const t = Math.max(0, (wall() - t0) * 1000);
      apply(received, Math.round(t));
      scene.render();
      frames++;
      if (done && t > SECONDS * US) {
        engine.stopRenderLoop();
        w.terminate();
        engine.dispose();
        resolve({
          commands: received.length,
          worstMarginMs: Math.round(worstMargin * 10) / 10,
          lateCommands: late,
          fps: Math.round(frames / (SECONDS + 0.05)),
        });
      }
    });
  });
}

async function main() {
  const out = document.getElementById('out')!;
  const canvas = document.getElementById('stage') as HTMLCanvasElement;
  const result = {
    userAgent: navigator.userAgent,
    fixedStep: await fixedStep(),
    live: {
      lookahead100ms: await live(canvas, 0.1),
      lookahead0ms: await live(canvas, 0),
    },
  };
  out.textContent = JSON.stringify(result, null, 2);
  (window as unknown as { spikeResult: unknown }).spikeResult = result;
}

main().catch((e: unknown) => {
  document.getElementById('out')!.textContent = `Failed: ${String(e)}`;
  (window as unknown as { spikeResult: unknown }).spikeResult = { error: String(e) };
});
