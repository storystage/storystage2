/**
 * Packing a film's class models with the class Backstage on this device (S4's `packModels`,
 * decision 0049), from `@storystage/backstage-import/pack`, which stays light: it brings in none of
 * the import pipeline.
 */
import type { HostInterface } from '@storystage/host';
import { packModels } from '@storystage/backstage-import/pack';
import type { Pack } from './useSaving.ts';

export function classPacking(host: HostInterface): Pack {
  return (production, files) => packModels(production, files, host.classes.backstage());
}
