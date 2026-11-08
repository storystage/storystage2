/**
 * WP3.9: device budgets (`docs/spec/17-backstage.md`, section 4). Every model is reduced to its
 * section's budget (`optimize.ts`), and a scene is checked against the scene budget, so a
 * production runs smoothly on the reference 4 GB Chromebook (CLAUDE.md, rule 6).
 *
 * The figures are spike 1.2's working assumption (`docs/spikes/REPORT.md`), used until the
 * reference devices have run it (#6; owner, 7 Nov 2026). They live here and nowhere else.
 */
import type { BackstageItem, Section } from './manifest.ts';

export interface Budget {
  readonly triangles: number;
  /** The longer side of the largest texture, in pixels. */
  readonly textureMaxPx: number;
}

/** True until spike 1.2 has been measured on the reference devices; then the figures change. */
export const BUDGETS_ARE_PROVISIONAL = true;

/**
 * Per model, by home section. A character is the spike's working figure; a prop is held small
 * because scenes have many; backdrops are a ground and a sky, with larger pictures.
 */
export const ITEM_BUDGETS: Readonly<Record<Section, Budget>> = {
  cast: { triangles: 20_000, textureMaxPx: 1024 },
  props: { triangles: 8_000, textureMaxPx: 1024 },
  set: { triangles: 20_000, textureMaxPx: 1024 },
  backdrops: { triangles: 4_000, textureMaxPx: 2048 },
};

/** Per scene: everything on stage at once. */
export const SCENE_BUDGET = { triangles: 100_000, textureMegabytes: 64 } as const;

export const budgetFor = (item: Pick<BackstageItem, 'section'>): Budget =>
  ITEM_BUDGETS[item.section];

export interface SceneCheck {
  readonly triangles: number;
  /** An estimate: each model's largest texture, uncompressed, with its smaller copies. */
  readonly textureMegabytes: number;
  readonly fits: boolean;
  /** For the learner, in plain words; null when the scene fits. */
  readonly message: string | null;
}

/** Every object on the stage, one entry per copy: two cats cost twice one cat. */
export function checkScene(models: readonly Pick<BackstageItem, 'budget'>[]): SceneCheck {
  let triangles = 0;
  let bytes = 0;
  for (const { budget } of models) {
    triangles += budget.triangles;
    bytes += (budget.textureMaxPx ** 2 * 4 * 4) / 3;
  }
  const textureMegabytes = bytes / 2 ** 20;
  const fits =
    triangles <= SCENE_BUDGET.triangles && textureMegabytes <= SCENE_BUDGET.textureMegabytes;
  return {
    triangles,
    textureMegabytes,
    fits,
    message: fits
      ? null
      : 'This scene may be slow on a school Chromebook: it has a lot of detail. Try fewer models, or simpler ones.',
  };
}
