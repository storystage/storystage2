/**
 * WP11.4: the end credits (spec 08, section 7). They roll after the last scene, in this order:
 * the learners' names (story and code), the models by section, the sound, the notices a licence
 * requires, and "Made with StoryStage 2". Only the headings change with the interface's language.
 */
import {
  creditsBySection,
  type BackstageItem,
  type CreditLine,
  type Section,
} from '@storystage/backstage';
import type { Production } from '@storystage/production';
import type { BackstageId } from '@storystage/story-api';

/** What the credits need from a model's Backstage record. */
export type FilmCreditable = Pick<
  BackstageItem,
  'id' | 'section' | 'licence' | 'credit' | 'source' | 'origin'
>;

export interface FilmCreditLine {
  readonly text: string;
  /** A CC BY licence's short name and deed, which the licence asks for. */
  readonly licence?: { readonly name: string; readonly url: string };
  /** A model the class imported, carried in the production's file (decision 0049). */
  readonly imported?: true;
}

export interface CreditBlock {
  /** `null` for the last line, which has no heading. */
  readonly heading: string | null;
  readonly lines: readonly FilmCreditLine[];
}

export type CreditHeading = 'story' | Section | 'sound' | 'notices';

export const CREDIT_HEADINGS: Readonly<Record<CreditHeading, string>> = {
  story: 'Story and code',
  cast: 'Cast',
  props: 'Props',
  set: 'Set',
  backdrops: 'Backdrops',
  sound: 'Sound',
  notices: 'Notices',
};

export const MADE_WITH = 'Made with StoryStage 2';

export interface CreditOptions {
  /** The notice a model's licence requires, if any, such as CMU's for Alice's models. */
  readonly notices?: (item: FilmCreditable) => string | null;
  /** Headings in the interface's language; the rest stays as it is. */
  readonly headings?: Partial<Record<CreditHeading, string>>;
}

/** Each model the production uses, once, in the order they first appear. Stand-ins aren't models. */
export function usedModels(production: Production): BackstageId[] {
  const seen = new Set<BackstageId>();
  for (const { setup } of production.scenes) {
    const { ground, sky, lighting } = setup.backdrop;
    for (const id of [ground, sky, lighting]) if (id) seen.add(id);
    for (const o of setup.objects) if (typeof o.model === 'string') seen.add(o.model);
  }
  return [...seen];
}

/** "Owl from the StoryStage Cast (CC0)": the model's name, and where it's from. */
const SOURCE = /^(.+?) ((?:by|from) .+)$/u;

const names = (all: readonly string[]) =>
  all.length === 1 ? all[0]! : `${all.slice(0, -1).join(', ')} and ${all.at(-1)!}`;

/**
 * A section's lines, with shipped models from one source made one line ("Cat, Owl and Robot
 * from the StoryStage Cast (CC0)"). An imported model always has a line of its own.
 */
function grouped(
  lines: readonly CreditLine[],
  items: ReadonlyMap<string, FilmCreditable & { readonly packed: boolean }>,
): FilmCreditLine[] {
  const out: { text: string[]; rest: string | null; line: FilmCreditLine }[] = [];
  for (const line of lines) {
    const item = items.get(line.id)!;
    const licence = item.licence.startsWith('CC-BY') && line.licence ? line.licence : undefined;
    const match = !item.packed ? SOURCE.exec(line.text) : null;
    const same = match && out.find((o) => o.rest === match[2]);
    if (same && match) {
      same.text.push(match[1]!);
      continue;
    }
    out.push({
      text: [match ? match[1]! : line.text],
      rest: match ? match[2]! : null,
      line: {
        text: line.text,
        ...(licence ? { licence } : {}),
        ...(item.packed ? { imported: true as const } : {}),
      },
    });
  }
  return out.map((o) =>
    o.rest === null || o.text.length === 1
      ? o.line
      : { ...o.line, text: `${names(o.text)} ${o.rest}` },
  );
}

/**
 * The film's credits. `find` looks up a shipped model's Backstage record; a model the class
 * imported comes from the production's own file. A model neither knows is left out.
 */
export function filmCredits(
  production: Production,
  find: (id: BackstageId) => FilmCreditable | undefined,
  options: CreditOptions = {},
): CreditBlock[] {
  const heading = (h: CreditHeading) => options.headings?.[h] ?? CREDIT_HEADINGS[h];
  const packed = new Map(production.manifest.models.map((m) => [m.item.id as string, m.item]));
  const items = new Map<string, FilmCreditable & { readonly packed: boolean }>();
  for (const id of usedModels(production)) {
    const own = packed.get(id);
    const item = own ?? find(id);
    if (item) items.set(id, { ...item, packed: own !== undefined });
  }

  const blocks: CreditBlock[] = [];
  const story = (production.manifest.credits?.names ?? [])
    .map((n) => n.trim())
    .filter((n) => n !== '');
  if (story.length > 0)
    blocks.push({ heading: heading('story'), lines: story.map((text) => ({ text })) });
  for (const section of creditsBySection([...items.values()]))
    blocks.push({ heading: heading(section.section), lines: grouped(section.lines, items) });
  const sound = production.manifest.audio.map((a) => a.label.trim()).filter((l) => l !== '');
  if (sound.length > 0)
    blocks.push({ heading: heading('sound'), lines: sound.map((text) => ({ text })) });
  const notices = new Set<string>();
  for (const item of items.values()) {
    const notice = options.notices?.(item);
    if (notice) notices.add(notice);
  }
  if (notices.size > 0)
    blocks.push({ heading: heading('notices'), lines: [...notices].map((text) => ({ text })) });
  blocks.push({ heading: null, lines: [{ text: MADE_WITH }] });
  return blocks;
}
