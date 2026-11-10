/**
 * WP3c (workplan 13.3): the Backstage catalogue in the Prompter's system prompt (spec 04, section
 * 2.1; spec 17, section 4a). Shipped models only, by section and class, each with the exact id
 * Claude must use to add it. Imported models are learners' and teachers' words, so they go in the
 * user turn as data, never here.
 *
 * The text is part of `system`, whose hash the native layer pins for a release, so the same
 * manifest always gives the same text, whatever order it lists its items in.
 */
import {
  DESCRIPTION_MAX,
  SECTIONS,
  type BackstageItem,
  type BackstageManifest,
  type Section,
} from './manifest.ts';

/** The catalogue's share of the system prompt (spec 04, section 2.1). */
export const CATALOGUE_TOKEN_BUDGET = 12_000;

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

export function catalogueText(manifest: BackstageManifest): string {
  const items = manifest.items
    .filter((i) => i.origin === 'shipped')
    .sort((a, b) => byText(a.class, b.class) || byText(a.id, b.id));

  // Joint sets, numbered in the order the catalogue first uses them.
  const sets = new Map<string, string>();
  const ordered = SECTIONS.flatMap((s) => items.filter((i) => i.section === s));
  for (const i of ordered) {
    if (i.joints === 'prop-only') continue;
    const key = i.joints.join(', ');
    if (!sets.has(key)) sets.set(key, `J${sets.size + 1}`);
  }

  const line = (i: BackstageItem) => {
    const name = i.description ? `${i.displayName}, ${i.description}` : i.displayName;
    const themes = i.themes.length ? ` [${i.themes.join(', ')}]` : '';
    // A ground or sky has no size on the stage and no joints (spec 17 section 2).
    if (i.section === 'backdrops') return `    ${i.id}: ${name}${themes}`;
    const joints =
      i.joints === 'prop-only' ? 'no joints' : `joints ${sets.get(i.joints.join(', '))}`;
    return `    ${i.id}: ${name}${themes} ${i.defaultSize.height} m, ${joints}`;
  };

  const lines = [
    'Every model shipped in Backstage, by section and class. Add one with its id exactly as written.',
    'Each line: id: name, what it looks like [themes] height at scale 1, and its joints.',
    'A model with no joints can move and turn, but not walk or gesture. Use only the joints in its set.',
    '',
    'Joint sets',
    ...[...sets].map(([joints, name]) => `  ${name}: ${joints}`),
  ];
  for (const section of SECTIONS) {
    lines.push('', SECTION_NAMES[section]);
    const here = items.filter((i) => i.section === section);
    if (!here.length) lines.push('  (none yet)');
    else if (section === 'backdrops')
      lines.push(
        "  A scene's ground or sky: set it as the scene's backdrop, never add it as a model.",
      );
    let cls = '';
    for (const i of here) {
      if (i.class !== cls) lines.push(`  ${(cls = i.class)}`);
      lines.push(line(i));
    }
  }
  return `${lines.join('\n')}\n`;
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
