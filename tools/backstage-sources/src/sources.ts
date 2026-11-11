/**
 * WP3.7: the source lists in a Backstage folder (`sources/*.json`). Each item says what it is,
 * its licence and credit line (from the licence audit, `docs/legal/licence-audit.md`), its own
 * page, and where to fetch it from, pinned: a GitHub repository at a commit, a URL with the
 * file's SHA-256, or an Arweave address (whose transaction id names fixed content). Pinning
 * means a build fetches exactly what was reviewed.
 */
import { SECTIONS, descriptionProblem, type Section } from '@storystage/backstage';
import { STORY_CLASSES, type StoryClass } from '@storystage/story-api';
import type { Exclude } from './exclude.ts';

/** Licences the audit allows in the shipped catalogue (audit, section 2, rule 1). */
export const SHIPPABLE_LICENCES = ['CC0-1.0', 'CC-BY-3.0', 'CC-BY-4.0'] as const;
export type ShippableLicence = (typeof SHIPPABLE_LICENCES)[number];

export type FetchSpec =
  /** A backdrop's `path` is its picture: .jpg, .png or .webp. */
  | { readonly github: string; readonly commit: string; readonly path: string }
  /** `sha256` may be left out only for an Arweave address, which names fixed content. */
  | {
      readonly url: string;
      readonly sha256?: string;
      readonly ext: 'glb' | 'vrm' | 'jpg' | 'png' | 'webp';
    }
  /** A model made in the build itself: a path under the Backstage folder's `generated/`. */
  | { readonly generated: string };

export interface SourceItem {
  /** `source/Class/name`, as the manifest's ids (WP3.4). */
  readonly id: string;
  readonly displayName: string;
  readonly class: StoryClass;
  readonly section: Section;
  readonly themes: readonly string[];
  /** What it looks like, for the Prompter's catalogue (spec 17, section 1, rule 5). */
  readonly description?: string;
  /**
   * Its real height in metres, where the file's own scale is something else: the build scales a
   * glTF model to it (spec 17, section 3, pipelines). Models from galleries such as Poly Pizza
   * come at every scale their makers used. Not for VRM files, which are kept byte for byte.
   */
  readonly height?: number;
  /**
   * Turns in whole degrees, so a glTF model faces +Z and stands up as every Backstage model
   * does (spec 17, section 1): `x` first (to stand it up), then `y` (to face it forward).
   * Galleries' models face every way their makers chose. Usually quarter turns, but a model that
   * leans in its own data (Poly Pizza's crutches lean 34°) takes whatever stands it up. Not for
   * VRM files.
   */
  readonly turn?: { readonly x?: number; readonly y?: number };
  readonly licence: ShippableLicence;
  readonly credit: string;
  /** The item's own page: the manifest's `source.url`. */
  readonly page: string;
  readonly fetch: FetchSpec;
  /** Parts to remove, added to the list's own `exclude` (`exclude.ts`). */
  readonly exclude?: Exclude;
  /**
   * For the `backdrops` section, and only there: what to make of the fetched picture (spec 17
   * section 2, `backdrops.ts`). A ground is a tile `tile` metres across, colour-matched to
   * `look`, the stage's flat colour for it as `rrggbb`; a sky is a dome. A sky's light may be
   * scaled by `exposure` (0.05 to 1, default 1) and coloured by `tint` (what white becomes, as
   * `rrggbb`), since a gallery's night sky comes as bright and grey as noon; `ahead` (0 to 1,
   * default 0.5) is the picture's column that faces straight ahead, so a sunset's sun is there.
   */
  readonly backdrop?: Backdrop;
}

export type Backdrop =
  | { readonly kind: 'ground'; readonly tile: number; readonly look: string }
  | {
      readonly kind: 'sky';
      readonly exposure?: number;
      readonly tint?: string;
      readonly ahead?: number;
    };

/** The ids the stage draws backdrops under (spec 17 section 2). */
const BACKDROP_IDS = {
  ground: /^storystage\/Ground\/[a-z][A-Za-z0-9]*$/,
  sky: /^storystage\/Sky\/[a-z][A-Za-z0-9]*$/,
} as const;
const BACKDROP_CLASS = { ground: 'Ground', sky: 'Scene' } as const;
const PICTURE = /\.(jpg|png|webp)$/;

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
    const backdrop = item.section === 'backdrops';
    if (backdrop) {
      // The stage's ids, which name grounds and skies in camelCase (`storystage/Ground/darkGrass`).
      if (!isText(item.id) || !Object.values(BACKDROP_IDS).some((r) => r.test(item.id as string)))
        e('a backdrop id must be storystage/Ground/<name> or storystage/Sky/<name>.');
    } else if (!isText(item.id) || !/^[a-z0-9-]+\/[A-Z][A-Za-z]+\/[a-z0-9-]+$/.test(item.id))
      e('id must be source/Class/name, for example kaykit/Biped/knight.');
    if (isText(item.id)) {
      if (seen.has(item.id)) e('has the same id as an earlier item.');
      else seen.add(item.id);
    }
    if (!isText(item.displayName)) e('needs a display name.');
    if (!STORY_CLASSES.includes(item.class as StoryClass)) e('class must be a Story API class.');
    if (!SECTIONS.includes(item.section as Section))
      e(`section must be one of ${SECTIONS.join(', ')}.`);
    if (!Array.isArray(item.themes) || !item.themes.every((t) => typeof t === 'string'))
      e('themes must be a list of words.');
    if (item.description !== undefined) {
      const problem =
        typeof item.description === 'string'
          ? descriptionProblem(item.description)
          : 'A description is one line of plain words.';
      if (problem) e(problem);
    }
    if (!SHIPPABLE_LICENCES.includes(item.licence as ShippableLicence))
      e(`licence must be one the audit allows to ship: ${SHIPPABLE_LICENCES.join(', ')}.`);
    if (!isText(item.credit)) e('needs a credit line.');
    if (!isUrl(item.page)) e("page must be the https address of the item's own page.");
    if (badExclude(item.exclude)) e(EXCLUDE);
    if (backdrop) backdropProblems(item).forEach(e);
    else if (item.backdrop !== undefined) e('backdrop is for the backdrops section only.');
    if (item.turn !== undefined) {
      const t = item.turn as Record<string, unknown>;
      const degrees = (v: unknown) =>
        v === undefined || (Number.isInteger(v) && Math.abs(v as number) <= 270);
      if (
        !isObject(t) ||
        !Object.keys(t).every((k) => k === 'x' || k === 'y') ||
        !degrees(t.x) ||
        !degrees(t.y)
      )
        e('turn must be { x?, y? }, each a whole number of degrees from -270 to 270.');
    }
    if (item.height !== undefined || item.turn !== undefined) {
      if (
        item.height !== undefined &&
        (typeof item.height !== 'number' || !(item.height > 0 && item.height <= 1000))
      )
        e('height must be metres, more than 0 and at most 1,000.');
      const f = item.fetch as Record<string, unknown> | undefined;
      const vrm = f && (f.ext === 'vrm' || (typeof f.path === 'string' && f.path.endsWith('.vrm')));
      if (vrm) e('height and turn are for glTF models; a VRM file is kept as it is.');
    }
    const f = item.fetch;
    if (!isObject(f))
      e('needs a fetch: { github, commit, path }, { url, sha256, ext } or { generated }.');
    else if ('generated' in f) {
      if (typeof f.generated !== 'string' || !/^[\w-]+(\/[\w-]+)*\.glb$/.test(f.generated))
        e('fetch.generated must be a .glb path under generated/.');
    } else if ('github' in f) {
      if (!isText(f.github) || !/^[\w.-]+\/[\w.-]+$/.test(f.github))
        e('fetch.github must be owner/repository.');
      if (typeof f.commit !== 'string' || !/^[0-9a-f]{40}$/.test(f.commit))
        e(
          'fetch.commit must be a full 40-character commit, so the build fetches what was reviewed.',
        );
      if (backdrop) {
        if (!isText(f.path) || !PICTURE.test(f.path))
          e("a backdrop's fetch.path must be its picture: .jpg, .png or .webp.");
      } else if (!isText(f.path) || !/\.(glb|gltf|vrm)$/.test(f.path))
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
      if (backdrop) {
        if (f.ext !== 'jpg' && f.ext !== 'png' && f.ext !== 'webp')
          e("a backdrop's fetch.ext must be jpg, png or webp.");
      } else if (f.ext !== 'glb' && f.ext !== 'vrm') e('fetch.ext must be glb or vrm.');
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true, list: json as unknown as SourceList };
}

/** A backdrop item's own rules: its kind, its class, and nothing a model would take. */
function backdropProblems(item: Record<string, unknown>): string[] {
  const b = item.backdrop;
  if (!isObject(b) || (b.kind !== 'ground' && b.kind !== 'sky'))
    return ["a backdrop needs backdrop: { kind: 'ground', tile, look } or { kind: 'sky' }."];
  const problems: string[] = [];
  const kind = b.kind;
  if (typeof item.id === 'string' && !BACKDROP_IDS[kind].test(item.id))
    problems.push(
      `a ${kind}'s id must be storystage/${kind === 'ground' ? 'Ground' : 'Sky'}/<name>.`,
    );
  if (item.class !== BACKDROP_CLASS[kind])
    problems.push(`a ${kind}'s class must be ${BACKDROP_CLASS[kind]}.`);
  if (kind === 'ground') {
    if (!Object.keys(b).every((k) => k === 'kind' || k === 'tile' || k === 'look'))
      problems.push('a ground takes only kind, tile and look.');
    if (typeof b.tile !== 'number' || !(b.tile >= 0.5 && b.tile <= 20))
      problems.push("a ground's tile must be its size in metres, from 0.5 to 20.");
    if (typeof b.look !== 'string' || !/^[0-9a-f]{6}$/.test(b.look))
      problems.push("a ground's look must be the stage's flat colour as rrggbb.");
  } else {
    if (!Object.keys(b).every((k) => ['kind', 'exposure', 'tint', 'ahead'].includes(k)))
      problems.push('a sky takes only kind, exposure, tint and ahead.');
    if (b.tint !== undefined && (typeof b.tint !== 'string' || !/^[0-9a-f]{6}$/.test(b.tint)))
      problems.push("a sky's tint must be what white becomes, as rrggbb.");
    if (b.ahead !== undefined && (typeof b.ahead !== 'number' || !(b.ahead >= 0 && b.ahead <= 1)))
      problems.push("a sky's ahead must be the picture's column that faces ahead, from 0 to 1.");
    if (
      b.exposure !== undefined &&
      (typeof b.exposure !== 'number' || !(b.exposure >= 0.05 && b.exposure <= 1))
    )
      problems.push("a sky's exposure must be from 0.05 to 1.");
  }
  if (item.height !== undefined || item.turn !== undefined || item.exclude !== undefined)
    problems.push('a backdrop takes no height, turn or exclude: the build makes its model.');
  if (isObject(item.fetch) && 'generated' in item.fetch)
    problems.push(
      "a backdrop's fetch is its picture, pinned: { github, commit, path } or { url, sha256, ext }.",
    );
  return problems;
}
