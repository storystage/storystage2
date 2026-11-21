/**
 * WP3c (workplan 13.3): the Backstage catalogue the Prompter gives Claude (spec 04, section 2.7;
 * spec 17, section 4a). Shipped models only, by section and class, each with the exact id Claude
 * must use to add it. Imported models are learners' and teachers' words, so they go in the user
 * turn as data, never here.
 *
 * Since the owner's choice of 21 Nov 2026 the Prompter no longer sends the whole catalogue. Its
 * system prompt holds the index (`renderIndex`): every model's id, name and joint set, one short
 * line each. Each request then carries the full lines of the models that matter to it, chosen
 * with `searchCatalogue`, and Claude can ask for more. The build writes both forms:
 * `prompter-catalogue.json` (`catalogueJson`) for the Prompter, and `prompter-catalogue.txt`
 * (`catalogueText`), every full line, for people to read.
 *
 * The index is part of `system`, whose hash the native layer pins for a release, so the same
 * manifest always gives the same text, whatever order it lists its items in.
 */
import {
  DESCRIPTION_MAX,
  SECTIONS,
  type BackstageItem,
  type BackstageManifest,
  type Section,
} from './manifest.ts';

/** The index's share of the system prompt (spec 04, section 2.7). */
export const CATALOGUE_INDEX_TOKEN_BUDGET = 12_000;

/** Three characters a token: a cautious guess that overcounts (spec 04, section 2.1). */
export const catalogueTokens = (text: string) => Math.ceil(text.length / 3);

const SECTION_NAMES: Readonly<Record<Section, string>> = {
  cast: 'Cast',
  props: 'Props',
  set: 'Set',
  backdrops: 'Backdrops',
};

/** Plain code-point order, so the text never depends on the machine's locale. */
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** One shipped model, as the Prompter's catalogue gives it. */
export interface CatalogueItem {
  readonly id: string;
  readonly section: Section;
  readonly class: string;
  /** Its display name. */
  readonly name: string;
  /** Its joint set, `J1`, `J2` and so on (the catalogue's `joints`), or `none`. */
  readonly joints: string;
  /** The full line: `id: Name, description [themes] height m, joints J2`. */
  readonly line: string;
  /** The index line: `id: Name (J2)` or `id: Name (no joints)`; a backdrop's is `id: Name`. */
  readonly short: string;
  /** Its name, description, themes and class in lower-case words, each once, for searching. */
  readonly words: readonly string[];
}

/** The catalogue as `prompter-catalogue.json` holds it. */
export interface Catalogue {
  /** What the index says before its joint sets and models. */
  readonly header: string;
  /** Each joint set's joints, numbered in the order the catalogue first uses them. */
  readonly joints: Readonly<Record<string, readonly string[]>>;
  /** Every shipped model, by section, then class, then id. */
  readonly items: readonly CatalogueItem[];
}

const TEXT_HEADER = [
  'Every model shipped in Backstage, by section and class. Add one with its id exactly as written.',
  'Each line: id: name, what it looks like [themes] height at scale 1, and its joints.',
  'A model with no joints can move and turn, but not walk or gesture. Use only the joints in its set.',
];

const INDEX_HEADER = [
  'Every model shipped in Backstage, by section and class: its id, its name and its joint set. Add one with its id exactly as written.',
  'What a model looks like, its themes, its height at scale 1 and the joints in its set come with its full line, in the request or from find_models.',
  'A model with no joints can move and turn, but not walk or gesture. Use only the joints in its set.',
];

/** Words too common to tell models apart. */
const STOP = new Set(
  'a an and the of in on with to for at by or as is are be it its his her their from into this that'.split(
    ' ',
  ),
);

/** A text's words, lower-cased, without the commonest. */
const termsOf = (text: string): string[] =>
  (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (w) => !STOP.has(w) && (w.length > 1 || /\d/.test(w)),
  );

/** A plain English plural folded to its singular, so `rocks` finds `rock` and `berries` `berry`. */
const fold = (w: string): string => {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

/** The shipped items in the catalogue's order, with their joint sets. */
function prepare(manifest: BackstageManifest) {
  const sorted = manifest.items
    .filter((i) => i.origin === 'shipped')
    .sort((a, b) => byText(a.class, b.class) || byText(a.id, b.id));
  const items = SECTIONS.flatMap((s) => sorted.filter((i) => i.section === s));
  // Joint sets, numbered in the order the catalogue first uses them.
  const sets = new Map<string, string>();
  for (const i of items) {
    if (i.joints === 'prop-only') continue;
    const key = i.joints.join(', ');
    if (!sets.has(key)) sets.set(key, `J${sets.size + 1}`);
  }
  const setOf = (i: BackstageItem) =>
    i.joints === 'prop-only' ? 'none' : sets.get(i.joints.join(', '))!;
  return { items, sets, setOf };
}

function fullLine(i: BackstageItem, set: string): string {
  const name = i.description ? `${i.displayName}, ${i.description}` : i.displayName;
  const themes = i.themes.length ? ` [${i.themes.join(', ')}]` : '';
  // A ground or sky has no size on the stage and no joints (spec 17 section 2).
  if (i.section === 'backdrops') return `${i.id}: ${name}${themes}`;
  const joints = set === 'none' ? 'no joints' : `joints ${set}`;
  return `${i.id}: ${name}${themes} ${i.defaultSize.height} m, ${joints}`;
}

function shortLine(i: BackstageItem, set: string): string {
  if (i.section === 'backdrops') return `${i.id}: ${i.displayName}`;
  return `${i.id}: ${i.displayName} (${set === 'none' ? 'no joints' : set})`;
}

/**
 * The header, the joint sets (unless null), then each section's models under their class, one
 * line each.
 */
function render(
  header: readonly string[],
  sets: Iterable<readonly [string, string]> | null,
  items: readonly { readonly section: Section; readonly class: string }[],
  lineOf: (index: number) => string,
): string {
  const lines = [...header];
  if (sets)
    lines.push('', 'Joint sets', ...[...sets].map(([name, joints]) => `  ${name}: ${joints}`));
  for (const section of SECTIONS) {
    lines.push('', SECTION_NAMES[section]);
    const here = items.flatMap((item, n) => (item.section === section ? [{ item, n }] : []));
    if (!here.length) lines.push('  (none yet)');
    else if (section === 'backdrops')
      lines.push(
        "  A scene's ground or sky: set it as the scene's backdrop, never add it as a model.",
      );
    let cls = '';
    for (const { item, n } of here) {
      if (item.class !== cls) lines.push(`  ${(cls = item.class)}`);
      lines.push(`    ${lineOf(n)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** Every full line, for people to read: `prompter-catalogue.txt`. */
export function catalogueText(manifest: BackstageManifest): string {
  const { items, sets, setOf } = prepare(manifest);
  const named = [...sets].map(([joints, name]) => [name, joints] as const);
  return render(TEXT_HEADER, named, items, (n) => fullLine(items[n]!, setOf(items[n]!)));
}

/** The catalogue as data: `prompter-catalogue.json` holds it. */
export function catalogueData(manifest: BackstageManifest): Catalogue {
  const { items, sets, setOf } = prepare(manifest);
  return {
    header: INDEX_HEADER.join('\n'),
    joints: Object.fromEntries([...sets].map(([joints, name]) => [name, joints.split(', ')])),
    items: items.map((i) => {
      const set = setOf(i);
      return {
        id: i.id,
        section: i.section,
        class: i.class,
        name: i.displayName,
        joints: set,
        line: fullLine(i, set),
        short: shortLine(i, set),
        words: [
          ...new Set(
            termsOf(`${i.displayName} ${i.description ?? ''} ${i.themes.join(' ')} ${i.class}`),
          ),
        ],
      };
    }),
  };
}

/** `prompter-catalogue.json`, byte for byte: the lock pins its SHA-256. */
export const catalogueJson = (manifest: BackstageManifest): string =>
  `${JSON.stringify(catalogueData(manifest), null, 2)}\n`;

/**
 * The index the Prompter's system prompt holds (spec 04, section 2.7): the header, then each
 * model's short line under its section and class. The joint sets' lists are left out (on
 * 21 Nov 2026, 55 sets were more than half the catalogue): Claude needs a set's joints only to
 * pose a model, and they come with the model's full line (`catalogue.joints`).
 */
export const renderIndex = (catalogue: Catalogue): string =>
  render(catalogue.header.split('\n'), null, catalogue.items, (n) => catalogue.items[n]!.short);

/**
 * The joints of each set some items name, J name to joint list, in the catalogue's order: what
 * goes with their full lines in <backstage_data> and from find_models (spec 04, section 2.7).
 */
export function jointsFor(
  catalogue: Catalogue,
  items: readonly CatalogueItem[],
): Record<string, readonly string[]> {
  const used = new Set(items.map((i) => i.joints));
  return Object.fromEntries(Object.entries(catalogue.joints).filter(([name]) => used.has(name)));
}

/**
 * The models that match some words, best first (spec 04, section 2.7): for the full lines a
 * request carries, and for find_models. Each word scores 3 when it is in a model's name and 1
 * when it is only in its description, themes or class, with plain plurals folded; a model no word
 * matches is left out. Ties go by section (cast, props, set, backdrops), then id, so the same
 * words always give the same list. The words only choose models: nothing of them is returned.
 */
export function searchCatalogue(
  items: readonly CatalogueItem[],
  words: string | readonly string[],
  options: { readonly section?: Section; readonly limit?: number } = {},
): CatalogueItem[] {
  const query = [
    ...new Set((typeof words === 'string' ? [words] : words).flatMap(termsOf).map(fold)),
  ];
  if (!query.length) return [];
  const scored: { item: CatalogueItem; score: number }[] = [];
  for (const item of items) {
    if (options.section && item.section !== options.section) continue;
    const name = new Set(termsOf(item.name).map(fold));
    const all = new Set(item.words.map(fold));
    let score = 0;
    for (const q of query) score += name.has(q) ? 3 : all.has(q) ? 1 : 0;
    if (score > 0) scored.push({ item, score });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      SECTIONS.indexOf(a.item.section) - SECTIONS.indexOf(b.item.section) ||
      byText(a.item.id, b.item.id),
  );
  return scored.slice(0, options.limit ?? scored.length).map((s) => s.item);
}

/**
 * Words that describe skin colour or ancestry, which descriptions never use (owner, 8 Nov 2026;
 * spec 17, section 1, rule 5). A guard for the reviewer, not a replacement for reading them.
 */
const NOT_DESCRIBED_BY =
  /\b(skin(ned)?|complexion|ancestry|ancestral|ethnic\w*|race|racial|african|asian|caucasian|european|latin[oa]|hispanic|arab)\b/i;

/** Why a description can't be used, in plain words, or null if it can. */
export function descriptionProblem(text: string): string | null {
  if (!text.trim() || /[\r\n]/.test(text)) return 'A description is one line of plain words.';
  if (text.length > DESCRIPTION_MAX)
    return `A description is at most ${DESCRIPTION_MAX} characters; this one is ${text.length}.`;
  if (NOT_DESCRIBED_BY.test(text))
    return 'Describe people by age, hair, glasses and clothes, never by skin colour or ancestry.';
  return null;
}
