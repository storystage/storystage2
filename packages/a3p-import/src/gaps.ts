/**
 * The import report (spec 19, section 7): everything in an Alice world that couldn't come across
 * as it was, in plain words, with where it was. An import with no gaps has an empty report.
 */

export type GapKind = 'model' | 'setUp' | 'class' | 'block' | 'value' | 'event' | 'unknown';

export interface ImportGap {
  /** For grouping the report: models, set-up, blocks… */
  readonly kind: GapKind;
  /** What it was in Alice, in words: "the mango tree's model", "cat move toward". */
  readonly what: string;
  /** Where it was: "Scene, set-up", "Scene.myFirstMethod, statement 3". */
  readonly where: string;
  /** Why it couldn't come across, or what was done instead. */
  readonly why: string;
}

/** "MangoTree" or "BROWN_SAVANA_GRASS" in words: "mango tree", "brown savana grass". */
export function words(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .trim();
}
