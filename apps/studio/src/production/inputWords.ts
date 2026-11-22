import { words } from '../strings.ts';

/** "steps", "steps and height", "steps, height and speed": names in a step's words. */
export function listWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return words.t('production.listAnd', {
    rest: names.slice(0, -1).join(', '),
    last: names.at(-1)!,
  });
}
