import type { ArcTemplate } from '@storystage/production';

/** An arc template: its id in the file and its parts, in order (`07-ux.md` section 6.3, WP10.2). */
export interface ArcTemplateDef {
  readonly template: ArcTemplate;
  readonly parts: readonly string[];
}

/**
 * The arcs every copy of StoryStage has. A curriculum template (WP16) is another entry with
 * `template: { curriculum: '<id>' }`, passed in alongside these: no code changes.
 */
export const ARC_TEMPLATES: readonly ArcTemplateDef[] = [
  { template: 'free', parts: [] },
  { template: 'threePart', parts: ['beginning', 'middle', 'end'] },
  { template: 'fivePart', parts: ['setup', 'conflict', 'challenge', 'climax', 'resolution'] },
];

/** The built-in arcs' ids, which have their own words in the strings file. */
export const BUILT_IN_ARCS = ['free', 'threePart', 'fivePart'] as const;
export type BuiltInArc = (typeof BUILT_IN_ARCS)[number];

export const isBuiltIn = (template: ArcTemplate): template is BuiltInArc =>
  typeof template === 'string';

/** The same template, whichever form it's written in. */
export const sameTemplate = (a: ArcTemplate, b: ArcTemplate): boolean =>
  typeof a === 'string' || typeof b === 'string' ? a === b : a.curriculum === b.curriculum;
