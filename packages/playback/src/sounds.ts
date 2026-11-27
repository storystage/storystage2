/**
 * The film's sounds as the runtime's `load` gives them (decision 0076, workplan 11.7): each by
 * the name a `playAudio` block gives it, with the length of the part the film uses, in seconds.
 * An imported clip plays its trim. Shelf sounds join when Backstage gives their `length` (S4's
 * spec 17); until then a shelf sound plays as missing, which is right while the shelf is empty.
 */
import type { Production } from '@storystage/production';

export function soundLengths(production: Production): Readonly<Record<string, number>> {
  const lengths: Record<string, number> = {};
  for (const clip of production.manifest.sounds ?? []) {
    const used = clip.trim.end - clip.trim.start;
    if (Number.isFinite(used) && used > 0) lengths[clip.id] = used;
  }
  return lengths;
}
