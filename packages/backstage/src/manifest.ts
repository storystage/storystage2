/**
 * WP0.8 contract: the Backstage manifest, `backstage.json` (WP3.4). It lists every model with
 * its home section, class, joints, licence, credit line and source, shipped or imported.
 *
 * Owner: S4. A change here is a `contract` pull request, reviewed before the code that uses it.
 * Users: the stage (models and joints), the sketch library, the Prompter's catalogue, film
 * credits (WP11.4) and the import pipeline (WP3.11, 3.12).
 */
import {
  STORY_CLASSES,
  type BackstageId,
  type JointName,
  type StoryClass,
} from '@storystage/story-api';

export const MANIFEST_VERSION = '1.0.0';

/** Each model's one home section (decision 0013); search covers all four. */
export const SECTIONS = ['cast', 'props', 'set', 'backdrops'] as const;
export type Section = (typeof SECTIONS)[number];

/**
 * Licences a model may have. The short list a learner or teacher picks from on import (3.12) is
 * CC0, CC BY, CC BY-SA, CC BY-NC, made it myself and not sure; `permission` covers a licence
 * granted in writing (for example CMU for Alice's models), recorded in `docs/legal/`.
 */
export const LICENCES = [
  'CC0-1.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'CC-BY-NC-4.0',
  'own-work',
  'not-sure',
  'permission',
] as const;
export type Licence = (typeof LICENCES)[number];

export const FACINGS = ['front', 'threeQuarter', 'side', 'back'] as const;
export type Facing = (typeof FACINGS)[number];

export interface BackstageItem {
  /** The Alice gallery path where there is one (`Quadruped/Cat/AbyssinianCat`), else `source/class/name`. */
  readonly id: BackstageId;
  readonly section: Section;
  readonly class: StoryClass;
  /** The name learners see ("Abyssinian cat"). */
  readonly displayName: string;
  /** For browsing by theme (WP3.10), for example `animals`, `fairy tale`, `space`. */
  readonly themes: readonly string[];
  /** Paths relative to the Backstage folder. */
  readonly files: { readonly model: string; readonly thumbnail: string };
  /** Joints mapped to the joint map (WP3.3), or `prop-only` if it can move but not walk or gesture. */
  readonly joints: readonly JointName[] | 'prop-only';
  /** Height in metres at scale 1. */
  readonly defaultSize: { readonly height: number };
  /** What it was reduced to for the device budget (WP3.9). */
  readonly budget?: { readonly triangles: number; readonly textureMaxPx: number };
  readonly licence: Licence;
  /** The credit line, as it appears in film credits ("Cat by Kenney (CC0)"). Never empty. */
  readonly credit: string;
  /** Where it came from. Required, except for `own-work`. */
  readonly source?: { readonly url: string; readonly retrieved?: string };
  /** For `permission`: the record in `docs/legal/` that grants it. */
  readonly permission?: string;
  /** Shipped with StoryStage, or imported into a class (WP3.11). */
  readonly origin: 'shipped' | 'imported';
  /** Sketches for the Storyboard (WP10.5): four facings, and a few poses for characters. */
  readonly sketches: readonly {
    readonly facing: Facing;
    readonly pose?: string;
    readonly file: string;
  }[];
}

export interface BackstageManifest {
  readonly manifestVersion: string;
  readonly items: readonly BackstageItem[];
}

export type ValidationResult =
  | { readonly ok: true; readonly manifest: BackstageManifest }
  | { readonly ok: false; readonly errors: readonly string[] };

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isText = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const oneOf = <T extends string>(list: readonly T[], x: unknown): x is T =>
  typeof x === 'string' && list.includes(x as T);

/**
 * Checks a parsed `backstage.json`. Every item needs a section, a licence and a credit (WP3
 * done-when), and ids must be unique. Errors are for developers and the import pipeline.
 */
export function validateManifest(json: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObject(json)) return { ok: false, errors: ['The manifest is not an object.'] };
  if (json.manifestVersion !== MANIFEST_VERSION)
    errors.push(
      `manifestVersion must be "${MANIFEST_VERSION}", not ${JSON.stringify(json.manifestVersion)}.`,
    );
  if (!Array.isArray(json.items))
    return { ok: false, errors: [...errors, 'items must be a list.'] };
  const seen = new Set<string>();
  json.items.forEach((item: unknown, i: number) => {
    const where = `items[${i}]`;
    if (!isObject(item)) {
      errors.push(`${where} is not an object.`);
      return;
    }
    const id = isText(item.id) ? item.id : `#${i}`;
    const e = (m: string) => errors.push(`${where} (${id}): ${m}`);
    if (!isText(item.id)) e('needs an id.');
    else if (seen.has(item.id)) e('has the same id as an earlier item.');
    else seen.add(item.id);
    if (!oneOf(SECTIONS, item.section)) e(`section must be one of ${SECTIONS.join(', ')}.`);
    if (!oneOf(STORY_CLASSES, item.class)) e('class must be a Story API class.');
    if (!isText(item.displayName)) e('needs a display name.');
    if (!Array.isArray(item.themes) || !item.themes.every((t) => typeof t === 'string'))
      e('themes must be a list of words.');
    if (!isObject(item.files) || !isText(item.files.model) || !isText(item.files.thumbnail))
      e('files needs a model and a thumbnail.');
    if (!(item.joints === 'prop-only' || (Array.isArray(item.joints) && item.joints.every(isText))))
      e('joints must be a list of joint names, or "prop-only".');
    if (
      !isObject(item.defaultSize) ||
      !(typeof item.defaultSize.height === 'number' && item.defaultSize.height > 0)
    )
      e('defaultSize.height must be a positive number of metres.');
    if (!oneOf(LICENCES, item.licence)) e(`licence must be one of ${LICENCES.join(', ')}.`);
    if (!isText(item.credit)) e('needs a credit line.');
    if (item.licence !== 'own-work' && !(isObject(item.source) && isText(item.source.url)))
      e('needs a source URL (only "own-work" may leave it out).');
    if (item.licence === 'permission' && !isText(item.permission))
      e('a "permission" licence must name its record in docs/legal/.');
    if (item.origin !== 'shipped' && item.origin !== 'imported')
      e('origin must be "shipped" or "imported".');
    if (item.origin === 'shipped' && item.licence === 'not-sure')
      e('a shipped model cannot have licence "not-sure".');
    if (
      !Array.isArray(item.sketches) ||
      !item.sketches.every((s) => isObject(s) && oneOf(FACINGS, s.facing) && isText(s.file))
    )
      e('sketches must be a list of { facing, file }.');
  });
  return errors.length
    ? { ok: false, errors }
    : { ok: true, manifest: json as unknown as BackstageManifest };
}

/**
 * Whether a production using this model may leave the school: Export for distribution and the
 * pathway exports (3.12). Non-commercial and "not sure" items are fine in class only.
 */
export function mayDistribute(
  item: Pick<BackstageItem, 'licence' | 'displayName'>,
): { readonly allowed: true } | { readonly allowed: false; readonly reason: string } {
  if (item.licence === 'CC-BY-NC-4.0')
    return {
      allowed: false,
      reason: `${item.displayName} may only be used for non-commercial work, so this film can be shown in school but not shared outside it.`,
    };
  if (item.licence === 'not-sure')
    return {
      allowed: false,
      reason: `Nobody has checked who made ${item.displayName} and what we may do with it, so this film can be shown in school but not shared outside it.`,
    };
  return { allowed: true };
}

/** The credit lines a film must show for the models it uses (WP11.4): every one, in a stable order. */
export function creditLines(items: readonly Pick<BackstageItem, 'id' | 'credit'>[]): string[] {
  return [...new Map(items.map((i) => [i.id, i.credit])).entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([, credit]) => credit);
}
