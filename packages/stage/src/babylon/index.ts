/**
 * `@storystage/stage/babylon`: the real stage. It's a separate entry so that packages using only
 * the `Stage` type, and pages that never open a scene, don't load Babylon.js.
 */
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { keyName } from '../keys.ts';
import type { ModelSource } from './models.ts';
import { BabylonStage } from './stage.ts';

export { BabylonStage };
export { modelsFromManifest, type ModelFile, type ModelSource } from './models.ts';

export interface BabylonStageOptions {
  /** Where to draw. For export, a canvas that's never on the page. */
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Where to find models. Without it, a scene can only use stand-ins. */
  readonly models?: ModelSource;
  /** True for export: keeps each frame so it can be read back. It costs speed on iPads. */
  readonly offscreen?: boolean;
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

export function createBabylonStage(options: BabylonStageOptions): BabylonStage {
  const { canvas, models, offscreen = false } = options;
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: offscreen, stencil: false });
  const stage = new BabylonStage(engine, { models });
  if (!offscreen && 'addEventListener' in canvas && 'clientWidth' in canvas)
    listenTo(canvas, stage);
  return stage;
}
