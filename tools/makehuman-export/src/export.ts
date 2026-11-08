/**
 * What the assets repository's MakeHuman build needs from `people.json` (`export-cli.ts`).
 *
 * `--only` makes just some of the people, for a trial or after a change to a few. The source
 * list still names everyone: the Backstage build keeps the others from their committed models
 * (`tools/backstage-sources/src/fetch.ts`), so a partial run never drops anyone from Backstage.
 */
import { humanInfo, sourceList } from './human-info.ts';
import type { Person } from './people.ts';

export function exportPeople(everyone: readonly Person[], only?: readonly string[]) {
  const people = only ? everyone.filter((p) => only.includes(p.id)) : everyone;
  return {
    /** The people to make, as MPFB2's dicts for the Blender script. */
    toMake: people.map(humanInfo),
    /** Everyone, as a Backstage source list. */
    sources: sourceList(everyone),
  };
}
