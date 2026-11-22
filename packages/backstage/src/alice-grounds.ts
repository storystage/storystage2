/**
 * Backstage's ground for each of Alice's ground appearances (`SGround.SurfaceAppearance`), for
 * importing an Alice world (spec 19, WP9b, S6): a world painted `MOON` keeps a moon ground.
 *
 * The grounds are the stage's built-in Backdrops (`packages/stage/src/backdrops.ts`, S3): flat
 * colours for now, since Alice's own textures are CMU's and aren't ours to copy. CC0 textures
 * can replace the colours later (WP3b) under the same ids, so this table won't change.
 *
 * Keyed by the names Alice's 34 starter worlds use (S6 counted them), in Alice's own spelling
 * (`BROWN_SAVANA_GRASS`). A name not here gives the default ground, and the import reports it.
 * `@storystage/backstage-import`'s tests check every id against the stage's `GROUND_TYPES`.
 */
import { backstageId, type BackstageId } from '@storystage/story-api';

const ground = (name: string) => backstageId(`storystage/Ground/${name}`);

export const ALICE_GROUNDS: Readonly<Record<string, BackstageId>> = {
  BROWN_SAVANA_GRASS: ground('brownSavannaGrass'),
  JUNGLE: ground('jungle'),
  DRY_GRASS: ground('dryGrass'),
  SWAMP: ground('swamp'),
  MARS: ground('mars'),
  SNOW: ground('snow'),
  SANDY_DESERT: ground('sandyDesert'),
  DARK_GRASS: ground('darkGrass'),
  MOON: ground('moon'),
  OCEAN: ground('ocean'),
};
