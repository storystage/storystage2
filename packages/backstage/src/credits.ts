/**
 * WP3c (workplan 3.4): credits from the manifest, for the About screen (every shipped model) and
 * for a film's end credits (the models it uses, WP11.4). Spec 17, section 3a.
 *
 * Both group credits as Cast, Props, Set and Backdrops, as the sketch library and the Prompter's
 * catalogue do, and give each line its licence's name and link and the model's own page, which
 * CC BY asks for. A CC BY model the build or an import changed says so in its credit line
 * (`creditFor`; owner, 8 Nov 2026).
 */
import { SECTIONS, type BackstageItem, type Licence, type Section } from './manifest.ts';

/** What a credit needs from a manifest item. */
export type Creditable = Pick<BackstageItem, 'id' | 'section' | 'licence' | 'credit' | 'source'>;

export interface CreditLine {
  readonly id: BackstageItem['id'];
  /** The model's credit line, as the manifest gives it. */
  readonly text: string;
  /** The licence's short name and its deed, for Creative Commons licences. */
  readonly licence?: { readonly name: string; readonly url: string };
  /** The model's own page. */
  readonly source?: string;
}

export interface CreditSection {
  readonly section: Section;
  /** The heading: "Cast", "Props", "Set" or "Backdrops". */
  readonly title: string;
  readonly lines: readonly CreditLine[];
}

const TITLES: Readonly<Record<Section, string>> = {
  cast: 'Cast',
  props: 'Props',
  set: 'Set',
  backdrops: 'Backdrops',
};

export const LICENCE_LINKS: Readonly<Partial<Record<Licence, { name: string; url: string }>>> = {
  'CC0-1.0': { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  'CC-BY-3.0': { name: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' },
  'CC-BY-4.0': { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  'CC-BY-SA-4.0': { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  'CC-BY-NC-4.0': { name: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
};

/**
 * The models' credits by section, each model once, alphabetically within its section. Sections
 * with no models are left out, so a film's credits have no empty headings.
 */
export function creditsBySection(items: readonly Creditable[]): CreditSection[] {
  const once = new Map(items.map((i) => [i.id, i]));
  return SECTIONS.map((section) => ({
    section,
    title: TITLES[section],
    lines: [...once.values()]
      .filter((i) => i.section === section)
      .map((i): CreditLine => {
        const licence = LICENCE_LINKS[i.licence];
        return {
          id: i.id,
          text: i.credit,
          ...(licence ? { licence } : {}),
          ...(i.source?.url ? { source: i.source.url } : {}),
        };
      })
      .sort((a, b) => a.text.localeCompare(b.text, 'en') || (a.id < b.id ? -1 : 1)),
  })).filter((s) => s.lines.length > 0);
}

/** Appended to a changed CC BY model's credit line. */
export const CHANGED = ', changed for StoryStage';

/** The CC BY licences, which ask that changes be indicated (CC BY 4.0, section 3(a)(1)(B)). */
const SAYS_CHANGED: readonly Licence[] = ['CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0'];

/**
 * The credit line to write into the manifest. The build changes every glTF model it ships
 * (re-encoded textures, perhaps simplified), and so does an import, so a CC BY model gets
 * `CHANGED`. VRM files are kept byte for byte, so they are not changed.
 */
export function creditFor(
  item: Pick<BackstageItem, 'licence' | 'credit'>,
  changed: boolean,
): string {
  if (!changed || !SAYS_CHANGED.includes(item.licence) || item.credit.endsWith(CHANGED))
    return item.credit;
  return `${item.credit}${CHANGED}`;
}
