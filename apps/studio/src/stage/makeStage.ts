/**
 * Making a stage for a tab (S2, S5, S3; spec 08 section 2): the Screening tab's shown one and
 * its hidden one, and later the Production stage's for Rehearse. Babylon.js is loaded only when a
 * stage is made, so the studio's first screen doesn't download it.
 */
import type { ModelSource } from '@storystage/stage/babylon';
import type { Stage } from '@storystage/stage';

export interface MakeStageOptions {
  /**
   * A stage that's never shown: for measuring and exporting. It keeps each frame so it can be
   * read back, always draws full size, and doesn't draw by itself.
   */
  readonly hidden: boolean;
  /** One source for every stage the App makes (`useModelSource`). */
  readonly models: ModelSource;
}

/**
 * A stage a tab shows. It can stop drawing and start again without being disposed, while it's
 * out of sight (Settings or Learn over it). A `FakeStage` draws nothing, so it has neither.
 */
export type ShownStage = Stage & {
  startLive?(): void;
  stopLive?(): void;
};

/** How a tab makes its stage. Tests give one that makes a `FakeStage`. */
export type StageMaker = (
  canvas: HTMLCanvasElement,
  options: MakeStageOptions,
) => Promise<ShownStage>;

/**
 * Makes a stage on `canvas`. A shown stage draws every frame until it's disposed; the driver
 * seeks it. Dispose of it when the tab unmounts.
 */
export const makeStage: StageMaker = async (canvas, { hidden, models }) => {
  const { createBabylonStage } = await import('@storystage/stage/babylon');
  // A hidden stage draws for measuring and the export: WebGL2, for the same pixels on every
  // machine (the stage README). Its WebGPU read-back is also upside down and in another colour
  // order today, which S3 has been told.
  const stage = await createBabylonStage({
    canvas,
    models,
    offscreen: hidden,
    ...(hidden ? { renderer: 'webgl2' as const } : {}),
  });
  if (hidden) return stage;
  stage.startLive();
  // The picture follows the canvas's size on the page.
  const watching = new ResizeObserver(() => stage.resize());
  watching.observe(canvas);
  const dispose = stage.dispose.bind(stage);
  stage.dispose = () => {
    watching.disconnect();
    dispose();
  };
  return stage;
};

/** A canvas that's never on the page, the export's size, for a hidden stage. */
export function hiddenCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  return canvas;
}
