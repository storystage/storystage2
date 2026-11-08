/**
 * WP5.6: which renderer draws the stage, and how hard it works. Both are chosen when the stage
 * is made, because the engine is made with them.
 */

/** WebGPU where the device has it (decision 0007), WebGL2 otherwise. */
export type Renderer = 'webgpu' | 'webgl2';
export type RendererChoice = Renderer | 'auto';

/**
 * `low` is for the reference Chromebook and iPad (WP5's done-when): the picture is drawn at two
 * thirds of its size and scaled up, without smoothing its edges. `standard` draws it full size,
 * smoothed. An export always draws full size, whatever the quality, so the film is the size asked.
 */
export type Quality = 'low' | 'standard';

export interface QualitySettings {
  /** Babylon.js draws at the canvas's size divided by this. */
  readonly scale: number;
  readonly antialias: boolean;
}

export const QUALITY: Readonly<Record<Quality, QualitySettings>> = {
  low: { scale: 1.5, antialias: false },
  standard: { scale: 1, antialias: true },
};

/** The renderer to try first. A stage that asks for WebGPU on a device without it gets WebGL2. */
export function pickRenderer(choice: RendererChoice, webgpu: boolean): Renderer {
  return choice !== 'webgl2' && webgpu ? 'webgpu' : 'webgl2';
}
