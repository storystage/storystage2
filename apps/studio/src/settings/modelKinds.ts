/**
 * "What is it?" on the import: each kind a person can pick, as Backstage's home section and Story
 * API class (spec 17, sections 2 and 5). Backdrops aren't imported: grounds, skies and lighting are
 * built into the stage.
 */
import type { Section } from '@storystage/backstage';
import type { StoryClass } from '@storystage/story-api';

export interface ModelKind {
  readonly id: string;
  readonly section: Section;
  readonly class: StoryClass;
}

export const MODEL_KINDS: readonly ModelKind[] = [
  { id: 'person', section: 'cast', class: 'Biped' },
  { id: 'fourLegs', section: 'cast', class: 'Quadruped' },
  { id: 'flyer', section: 'cast', class: 'Flyer' },
  { id: 'swimmer', section: 'cast', class: 'Swimmer' },
  { id: 'slitherer', section: 'cast', class: 'Slitherer' },
  { id: 'prop', section: 'props', class: 'Prop' },
  { id: 'vehicle', section: 'props', class: 'Transport' },
  { id: 'set', section: 'set', class: 'Prop' },
];

/** The kind an item was imported as, for the list; `null` for one no kind matches. */
export function kindOf(section: string, storyClass: string): ModelKind | null {
  return MODEL_KINDS.find((k) => k.section === section && k.class === storyClass) ?? null;
}
