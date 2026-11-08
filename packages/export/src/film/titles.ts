/**
 * WP11.4: the title card (spec 08, section 5). It comes first, for 4 seconds: the production's
 * title, and the byline under it. It fades in from black and into the first scene.
 */
import type { Production } from '@storystage/production';
import { micros, type Micros } from '@storystage/story-api';

/** How long the title card shows. */
export const TITLE_CARD = micros(4);

export interface TitleCard {
  readonly title: string;
  /** Left out when empty. */
  readonly byline: string | null;
  readonly duration: Micros;
}

/** The title card for a production, with the byline the learner typed in the export dialog. */
export function titleCard(production: Production, byline: string): TitleCard {
  const title = production.manifest.title.trim();
  return {
    title: title === '' ? 'Untitled film' : title,
    byline: byline.trim() === '' ? null : byline.trim(),
    duration: TITLE_CARD,
  };
}

/** The byline the dialog starts with, from the names for the credits: "A film by Ana and Sam". */
export function bylineFor(names: readonly string[]): string {
  const kept = names.map((n) => n.trim()).filter((n) => n !== '');
  if (kept.length === 0) return '';
  const all = kept.length === 1 ? kept[0]! : `${kept.slice(0, -1).join(', ')} and ${kept.at(-1)!}`;
  return `A film by ${all}`;
}
