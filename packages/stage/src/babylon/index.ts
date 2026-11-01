/**
 * `@storystage/stage/babylon`: the real stage. It's a separate entry so that packages using only
 * the `Stage` type, and pages that never open a scene, don't load Babylon.js.
 */
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { BabylonStage } from './stage.ts';

export { BabylonStage };

export interface BabylonStageOptions {
  /** Where to draw. For export, a canvas that's never on the page. */
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  /** True for export: keeps each frame so it can be read back. It costs speed on iPads. */
  readonly offscreen?: boolean;
}

export function createBabylonStage(options: BabylonStageOptions): BabylonStage {
  const engine = new Engine(options.canvas, true, {
    preserveDrawingBuffer: options.offscreen ?? false,
    stencil: false,
  });
  return new BabylonStage(engine);
}
