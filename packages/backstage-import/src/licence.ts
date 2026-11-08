/**
 * WP3.12, licence capture (spec 17, section 6). On import, the person picks the licence from a
 * short list, says where the model came from and, for CC BY, who made it. The credit line is made
 * from those, never typed freely, so every imported model's credit has the same shape.
 *
 * Licences and credits are part of what learners learn, as they are in industry.
 */
import { creditFor, type BackstageItem, type Licence } from '@storystage/backstage';

/** The short list, in the order the import shows it. `permission` is for shipped models only. */
export const LICENCE_CHOICES = [
  'CC0',
  'CC BY',
  'CC BY-SA',
  'CC BY-NC',
  'own-work',
  'not-sure',
] as const;
export type LicenceChoice = (typeof LICENCE_CHOICES)[number];

/** What the person gave on the import's licence step. */
export interface LicenceAnswers {
  readonly choice: LicenceChoice;
  /** CC BY only: 4.0 unless they say 3.0. */
  readonly version?: '4.0' | '3.0';
  /** The model's own page. Required, except for "I made it". */
  readonly sourceUrl?: string;
  /** Who made it. Required for every CC BY licence; optional for CC0. */
  readonly maker?: string;
}

export type LicenceProblem =
  /** No page given, where one is needed. */
  | 'needsSource'
  /** The page isn't a web address (`http:` or `https:`). */
  | 'badSource'
  /** A CC BY licence, and nobody named as its maker. */
  | 'needsMaker'
  /** The model has no name to credit. */
  | 'needsName';

/** In plain words, for the import's licence step. */
export const LICENCE_PROBLEMS: Readonly<Record<LicenceProblem, string>> = {
  needsSource: "Paste the address of the model's own page, where you found it.",
  badSource: "That doesn't look like a web page's address. It should start with https://.",
  needsMaker:
    'This licence asks you to name who made the model. Their name is usually on its page.',
  needsName: 'Give the model a name first.',
};

/** The longest maker's name, and the longest page address. */
export const MAKER_MAX = 80;
export const SOURCE_MAX = 2000;

export type LicenceRecord = Pick<BackstageItem, 'licence' | 'credit' | 'source'>;

const LICENCE_OF: Readonly<Record<Exclude<LicenceChoice, 'CC BY'>, Licence>> = {
  CC0: 'CC0-1.0',
  'CC BY-SA': 'CC-BY-SA-4.0',
  'CC BY-NC': 'CC-BY-NC-4.0',
  'own-work': 'own-work',
  'not-sure': 'not-sure',
};

/** The licence's name as a credit line says it. */
const SHORT_NAME: Readonly<Partial<Record<Licence, string>>> = {
  'CC-BY-3.0': 'CC BY 3.0',
  'CC-BY-4.0': 'CC BY 4.0',
  'CC-BY-SA-4.0': 'CC BY-SA 4.0',
  'CC-BY-NC-4.0': 'CC BY-NC 4.0',
};

const BY: readonly Licence[] = ['CC-BY-3.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'CC-BY-NC-4.0'];

/** Text on one line, with runs of spaces made one, and cut to `max` characters. */
const oneLine = (text: string | undefined, max: number) =>
  [...(text ?? '').replace(/\s+/g, ' ').trim()].slice(0, max).join('');

/** A web page's address, or `null`: only `http:` and `https:`, with no name or password in it. */
function webPage(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  return url.href;
}

/**
 * The licence, credit line and source for a model called `name`, from the person's answers.
 * Every import changes the model (it's reduced and re-encoded), so a CC BY credit ends ", changed
 * for StoryStage" (`creditFor`; spec 17, section 3a, rule 4).
 */
export function licenceRecord(
  name: string,
  answers: LicenceAnswers,
):
  | { readonly ok: true; readonly record: LicenceRecord }
  | { readonly ok: false; readonly problems: readonly LicenceProblem[] } {
  const problems: LicenceProblem[] = [];
  const shown = oneLine(name, 200);
  if (shown === '') problems.push('needsName');

  const licence: Licence =
    answers.choice === 'CC BY'
      ? answers.version === '3.0'
        ? 'CC-BY-3.0'
        : 'CC-BY-4.0'
      : LICENCE_OF[answers.choice];

  const maker = oneLine(answers.maker, MAKER_MAX);
  if (BY.includes(licence) && maker === '') problems.push('needsMaker');

  let source: string | null = null;
  const given = (answers.sourceUrl ?? '').trim();
  if (licence !== 'own-work') {
    if (given === '') problems.push('needsSource');
    else if (given.length > SOURCE_MAX || (source = webPage(given)) === null)
      problems.push('badSource');
  } else if (given !== '') {
    // "I made it" needs no page, but one given is kept if it's a web page.
    source = given.length <= SOURCE_MAX ? webPage(given) : null;
    if (source === null) problems.push('badSource');
  }
  if (problems.length > 0) return { ok: false, problems };

  let credit: string;
  switch (licence) {
    case 'CC0-1.0':
      credit = maker ? `${shown} by ${maker} (CC0)` : `${shown} (CC0)`;
      break;
    case 'own-work':
      // A learner's name is never put in a credit by default (WP11.4 lets learners choose).
      credit = `${shown}, made by our class`;
      break;
    case 'not-sure':
      credit = `${shown}, source not checked`;
      break;
    default:
      credit = `${shown} by ${maker}, ${SHORT_NAME[licence]}`;
  }
  return {
    ok: true,
    record: {
      licence,
      credit: creditFor({ licence, credit }, true),
      ...(source !== null ? { source: { url: source } } : {}),
    },
  };
}
