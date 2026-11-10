/**
 * `@storystage/stage/babylon`: the real stage. It's a separate entry so that packages using only
 * the `Stage` type, and pages that never open a scene, don't load Babylon.js.
 */
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { keyName } from '../keys.ts';
import type { ModelSource } from './models.ts';
import {
  QUALITY,
  pickRenderer,
  type Quality,
  type Renderer,
  type RendererChoice,
} from './quality.ts';
import { BabylonStage, SUPERSAMPLE } from './stage.ts';

export { BabylonStage };
export { modelsFromManifest, type ModelFile, type ModelSource } from './models.ts';
export { QUALITY, type Quality, type Renderer, type RendererChoice } from './quality.ts';

export interface BabylonStageOptions {
  /** Where to draw. For export, a canvas that's never on the page. */
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Where to find models. Without it, a scene can only use stand-ins. */
  readonly models?: ModelSource;
  /** True for export: keeps each frame so it can be read back. It costs speed on iPads. */
  readonly offscreen?: boolean;
  /** WebGPU where the device has it, by default; `webgl2` to be sure of the same pixels everywhere. */
  readonly renderer?: RendererChoice;
  /** `standard` by default. The reference devices use `low` (WP5.6). */
  readonly quality?: Quality;
}

/** Keys that would scroll the page while a learner is using them in a scene. */
const SCROLLING_KEYS: readonly string[] = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '];

/** Clicks and keys on the picture. Tab still moves on, so the keyboard can leave the canvas. */
function listenTo(canvas: HTMLCanvasElement, stage: BabylonStage) {
  if (canvas.tabIndex < 0) canvas.tabIndex = 0;
  canvas.addEventListener('click', (e) => {
    const across = canvas.width / (canvas.clientWidth || canvas.width);
    const down = canvas.height / (canvas.clientHeight || canvas.height);
    stage.click(e.offsetX * across, e.offsetY * down);
  });
  canvas.addEventListener('keydown', (e) => {
    const name = keyName(e.key);
    if (name) stage.key(name);
    if (SCROLLING_KEYS.includes(e.key)) e.preventDefault();
  });
  canvas.addEventListener('keyup', (e) => {
    const name = keyName(e.key);
    if (name) stage.keyRelease(name);
  });
}

/** WebGPU, if it starts; null if the device hasn't got it or it fails to start. */
async function webgpuEngine(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  antialias: boolean,
): Promise<AbstractEngine | null> {
  // Loaded only when it's tried, so a WebGL2 device never downloads it.
  const { WebGPUEngine } = await import('@babylonjs/core/Engines/webgpuEngine.js');
  if (!(await WebGPUEngine.IsSupportedAsync)) return null;
  const engine = new WebGPUEngine(canvas, { antialias, stencil: false });
  try {
    await engine.initAsync();
    return engine;
  } catch {
    engine.dispose();
    return null;
  }
}

/** Makes the stage, with the renderer and quality asked for. */
export async function createBabylonStage(options: BabylonStageOptions): Promise<BabylonStage> {
  const { canvas, models, offscreen = false, renderer = 'auto', quality = 'standard' } = options;
  const settings = QUALITY[quality];
  const supported = typeof navigator !== 'undefined' && 'gpu' in navigator;
  let engine: AbstractEngine | null = null;
  let used: Renderer = 'webgl2';
  // A GPU's multisampled edges aren't exactly repeatable (one shade, at a few edge pixels, on a
  // GeForce RTX 2060), so an export draws at twice the size with none, and `renderFrame`
  // averages each 2 by 2 block: smooth, and the same every time (owner's choice, 10 Nov 2026).
  const antialias = offscreen ? false : settings.antialias;
  // Babylon.js sizes a canvas on the page from its size there, which the drawing scale doubles,
  // but one that isn't on the page from its own width and height. So that one is made twice the
  // size here, and its frames still come back the size it was.
  const onPage = 'clientWidth' in canvas && canvas.clientWidth > 0;
  if (offscreen && !onPage) {
    canvas.width *= SUPERSAMPLE;
    canvas.height *= SUPERSAMPLE;
  }
  if (pickRenderer(renderer, supported) === 'webgpu') {
    engine = await webgpuEngine(canvas, antialias);
    if (engine) used = 'webgpu';
  }
  engine ??= new Engine(canvas, antialias, {
    preserveDrawingBuffer: offscreen,
    stencil: false,
  });
  engine.setHardwareScalingLevel(offscreen ? 1 / SUPERSAMPLE : settings.scale);
  const stage = new BabylonStage(engine, { models, renderer: used, quality, offscreen });
  if (!offscreen && 'addEventListener' in canvas && 'clientWidth' in canvas)
    listenTo(canvas, stage);
  return stage;
}
