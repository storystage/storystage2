/**
 * WP3.7: the source lists in a Backstage folder (`sources/*.json`). Each item says what it is,
 * its licence and credit line (from the licence audit, `docs/legal/licence-audit.md`), its own
 * page, and where to fetch it from, pinned: a GitHub repository at a commit, a URL with the
 * file's SHA-256, or an Arweave address (whose transaction id names fixed content). Pinning
 * means a build fetches exactly what was reviewed.
 */
import { SECTIONS, type Section } from '@storystage/backstage';
import { STORY_CLASSES, type StoryClass } from '@storystage/story-api';
import type { Exclude } from './exclude.ts';

/** Licences the audit allows in the shipped catalogue (audit, section 2, rule 1). */
export const SHIPPABLE_LICENCES = ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0'] as const;
export type ShippableLicence = (typeof SHIPPABLE_LICENCES)[number];

export type FetchSpec =
  | { readonly github: string; readonly commit: string; readonly path: string }
  /** `sha256` may be left out only for an Arweave address, which names fixed content. */
  | { readonly url: string; readonly sha256?: string; readonly ext: 'glb' | 'vrm' };

export interface SourceItem {
  /** `source/Class/name`, as the manifest's ids (WP3.4). */
  readonly id: string;
  readonly displayName: string;
  readonly class: StoryClass;
  readonly section: Section;
  readonly themes: readonly string[];
  readonly licence: ShippableLicence;
  readonly credit: string;
  /** The item's own page: the manifest's `source.url`. */
  readonly page: string;
  readonly fetch: FetchSpec;
  /** Parts to remove, added to the list's own `exclude` (`exclude.ts`). */
  readonly exclude?: Exclude;
}

export interface SourceList {
  readonly source: string;
  /** Parts to remove from every item in the list, for example the weapons a game pack carries. */
  readonly exclude?: Exclude;
  readonly items: readonly SourceItem[];
}

/** The list's and the item's excludes together. */
export const excludesFor = (list: SourceList, item: SourceItem): Exclude => ({
  nodes: [...(list.exclude?.nodes ?? []), ...(item.exclude?.nodes ?? [])],
  animations: [...(list.exclude?.animations ?? []), ...(item.exclude?.animations ?? [])],
});

const badExclude = (x: unknown) =>
  x !== undefined &&
  !(
    isObject(x) &&
    Object.keys(x).every((k) => k === 'nodes' || k === 'animations') &&
    Object.values(x).every((v) => Array.isArray(v) && v.every(isText))
  );

type Result = { ok: true; list: SourceList } | { ok: false; errors: string[] };

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isText = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const isUrl = (x: unknown) => typeof x === 'string' && /^https:\/\/\S+$/.test(x);

export function validateSources(json: unknown): Result {
  if (!isObject(json) || !isText(json.source) || !Array.isArray(json.items))
    return { ok: false, errors: ['A source list needs a "source" name and a list of "items".'] };
  const errors: string[] = [];
  const EXCLUDE = 'exclude must be { nodes?: [...], animations?: [...] }, lists of name patterns.';
  if (badExclude(json.exclude)) errors.push(EXCLUDE);
  const seen = new Set<string>();
  json.items.forEach((item: unknown, i: number) => {
    const e = (m: string) =>
      errors.push(`items[${i}]${isObject(item) && isText(item.id) ? ` (${item.id})` : ''}: ${m}`);
    if (!isObject(item)) {
      e('is not an object.');
      return;
    }
    if (!isText(item.id) || !/^[a-z0-9-]+\/[A-Z][A-Za-z]+\/[a-z0-9-]+$/.test(item.id))
      e('id must be source/Class/name, for example kaykit/Biped/knight.');
    else if (seen.has(item.id)) e('has the same id as an earlier item.');
    else seen.add(item.id);
    if (!isText(item.displayName)) e('needs a display name.');
    if (!STORY_CLASSES.includes(item.class as StoryClass)) e('class must be a Story API class.');
    if (!SECTIONS.includes(item.section as Section))
      e(`section must be one of ${SECTIONS.join(', ')}.`);
    if (!Array.isArray(item.themes) || !item.themes.every((t) => typeof t === 'string'))
      e('themes must be a list of words.');
    if (!SHIPPABLE_LICENCES.includes(item.licence as ShippableLicence))
      e(`licence must be one the audit allows to ship: ${SHIPPABLE_LICENCES.join(', ')}.`);
    if (!isText(item.credit)) e('needs a credit line.');
    if (!isUrl(item.page)) e("page must be the https address of the item's own page.");
    if (badExclude(item.exclude)) e(EXCLUDE);
    const f = item.fetch;
    if (!isObject(f)) e('needs a fetch: { github, commit, path } or { url, sha256, ext }.');
    else if ('github' in f) {
      if (!isText(f.github) || !/^[\w.-]+\/[\w.-]+$/.test(f.github))
        e('fetch.github must be owner/repository.');
      if (typeof f.commit !== 'string' || !/^[0-9a-f]{40}$/.test(f.commit))
        e(
          'fetch.commit must be a full 40-character commit, so the build fetches what was reviewed.',
        );
      if (!isText(f.path) || !/\.(glb|gltf|vrm)$/.test(f.path))
        e('fetch.path must end .glb, .gltf or .vrm.');
    } else {
      if (!isUrl(f.url)) e('fetch.url must be an https address.');
      // An Arweave transaction id names fixed content, so it pins the file by itself.
      const arweave =
        typeof f.url === 'string' && /^https:\/\/arweave\.net\/[\w-]{43}$/.test(f.url);
      const hasSha = typeof f.sha256 === 'string' && /^[0-9a-f]{64}$/.test(f.sha256);
      if (!hasSha && !(arweave && f.sha256 === undefined))
        e(
          "fetch.sha256 must be the file's SHA-256, 64 hex characters (only an Arweave address may leave it out).",
        );
      if (f.ext !== 'glb' && f.ext !== 'vrm') e('fetch.ext must be glb or vrm.');
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, list: json as unknown as SourceList };
}
