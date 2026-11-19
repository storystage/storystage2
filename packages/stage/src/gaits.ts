/**
 * A model's own clips for moving and standing (spec 17's standard clip names, agreed with S4,
 * 18 Nov): an animal, or any model that isn't a humanoid, walks, runs and stands with its own
 * clips, as a humanoid does with the shared ones (WP4.6). Pure, so the timeline can use it.
 *
 * - `walk` is the model's `walk`; a flyer's is its `fly`, a swimmer's its `swim`, if it has one.
 * - `run` is its `run`; without one, it runs with its walk, faster.
 * - `idle` plays while it stands. Styloo's makers spelt it `iddle`, until S4's build renames it.
 */
import type { StoryClass } from '@storystage/story-api';

export type GaitName = 'walk' | 'run' | 'idle';

export interface Gait {
  /** The model's own clip. */
  readonly clip: string;
  /**
   * How fast the clip carries the model, in metres a second at scale 1, from how far its feet
   * sweep; null if that can't be told (no feet: a flyer's or a swimmer's, or a model without
   * mapped joints). With a speed, the clip keeps pace with the ground covered, so the feet don't
   * slide; without, it plays at its own pace and the model moves at a plain walk or run.
   */
  readonly speed: number | null;
}

export type Gaits = Partial<Record<GaitName, Gait>>;

/** The clip names each gait is looked for under, best first. */
export function gaitClipNames(gait: GaitName, cls: StoryClass): readonly string[] {
  switch (gait) {
    case 'walk':
      return cls === 'Flyer' ? ['fly', 'walk'] : cls === 'Swimmer' ? ['swim', 'walk'] : ['walk'];
    case 'run':
      return ['run'];
    case 'idle':
      return ['idle', 'iddle'];
  }
}

/** How much of a step a foot is on the ground: about two thirds walking, under half running. */
export const ON_THE_GROUND: Record<'walk' | 'run', number> = { walk: 0.65, run: 0.4 };

/**
 * The speed a clip carries a model at, from how far its feet sweep front to back over one cycle
 * of `length` seconds: a foot on the ground moves back as far as the body goes forward while it's
 * down. `sweeps` are each foot's front-to-back range, in metres at scale 1.
 */
export function strideSpeed(
  sweeps: readonly number[],
  length: number,
  gait: 'walk' | 'run',
): number | null {
  const real = sweeps.filter((s) => Number.isFinite(s) && s > 1e-3);
  if (real.length === 0 || !(length > 0)) return null;
  const sweep = real.reduce((a, b) => a + b, 0) / real.length;
  return sweep / (ON_THE_GROUND[gait] * length);
}
