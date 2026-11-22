/** A scene step's refusal (S4's `SceneRefusal`) in plain words, for the Production stage. */
import type { SceneRefusal } from '@storystage/production';
import { words } from '../strings.ts';

export function refusalWords(r: SceneRefusal, name = ''): string {
  switch (r.code) {
    case 'objectInUse':
      return words.plural('production.objects.inUse', r.uses.length, { name });
    case 'tooManyObjects':
      return words.t('production.objects.tooMany', { limit: r.limit });
    case 'noSuchObject':
      return words.t('production.objects.gone', { name });
    case 'refused':
      return r.reason;
    default:
      return words.t('production.objects.notDone');
  }
}
