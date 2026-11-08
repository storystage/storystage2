/**
 * WP3c (workplan 3.9): opening a Backstage folder. Spec 17, section 4b.
 *
 * The shipped Backstage is bundled with the app (decision 0062): the Tauri apps carry it as
 * resources, and the browser version serves it from its own origin. A class's imports travel in
 * the production (decision 0049). Either way the app has a folder address, and this reads its
 * `backstage.json`, checks it, and answers what the rest of the app asks of it:
 *
 * - the stage: a model's address, joints and VRM version (`find`, as its `ModelSource` wants);
 * - Backstage's browse views: items and thumbnails;
 * - the About screen and film credits: `credits()`;
 * - the Prompter: `catalogue()`, the shipped models only.
 *
 * Models load lazily: the stage fetches a model only when a scene places it, and shares one copy
 * across the scene (`packages/stage`). The manifest is read once a session.
 */
import { catalogueText } from './catalogue.ts';
import { creditsBySection, type CreditSection } from './credits.ts';
import {
  MANIFEST_VERSION,
  validateManifest,
  type BackstageItem,
  type BackstageManifest,
} from './manifest.ts';

type Id = BackstageItem['id'];

/** What the stage needs to load a model. */
export interface BackstageModel {
  /** Where its file is. */
  readonly url: string;
  readonly joints: BackstageItem['joints'];
  /** For a VRM file, its version: a 0.x avatar faces -Z and must be turned (spec 17, rule 3). */
  readonly vrm?: '0' | '1';
}

export interface Backstage {
  /** Every model, each id once. */
  readonly items: readonly BackstageItem[];
  item(id: Id): BackstageItem | undefined;
  /** A model's file, joints and VRM version, or null if there's none by that id. */
  find(id: Id): BackstageModel | null;
  /** Its colour thumbnail's address, or null. */
  thumbnail(id: Id): string | null;
  /** Credits for every model, by section (spec 17, section 3a). */
  credits(): CreditSection[];
  /** The Prompter's catalogue: shipped models only (spec 17, section 4a). */
  catalogue(): string;
}

export type BackstageErrorCode = 'missing' | 'damaged';

/** Backstage couldn't be opened. `message` is in plain words for a person; `details` for a log. */
export class BackstageError extends Error {
  readonly code: BackstageErrorCode;
  readonly details: readonly string[];
  constructor(code: BackstageErrorCode, message: string, details: readonly string[] = []) {
    super(message);
    this.name = 'BackstageError';
    this.code = code;
    this.details = details;
  }
}

const MISSING =
  "Backstage couldn't be opened: its list of models is missing. Try installing StoryStage again.";
const DAMAGED =
  "Backstage couldn't be opened: its list of models is damaged or out of date. Try installing StoryStage again.";

const trimSlash = (folder: string) => folder.replace(/\/+$/, '');

/** A path inside the folder, made safe for an address segment by segment. */
const address = (folder: string, path: string) =>
  `${trimSlash(folder)}/${path.split('/').map(encodeURIComponent).join('/')}`;

/** A Backstage from a manifest already read, with `folder` the address its paths are under. */
export function backstageFrom(manifest: BackstageManifest, folder: string): Backstage {
  const checked = validateManifest(manifest);
  if (!checked.ok) throw new BackstageError('damaged', DAMAGED, checked.errors);
  const byId = new Map(manifest.items.map((i) => [i.id, i]));
  const items = [...byId.values()];
  return {
    items,
    item: (id) => byId.get(id),
    find(id) {
      const i = byId.get(id);
      if (!i) return null;
      return {
        url: address(folder, i.files.model),
        joints: i.joints,
        ...(i.vrm ? { vrm: i.vrm } : {}),
      };
    },
    thumbnail(id) {
      const i = byId.get(id);
      return i ? address(folder, i.files.thumbnail) : null;
    },
    credits: () => creditsBySection(items),
    catalogue: () => catalogueText({ manifestVersion: MANIFEST_VERSION, items }),
  };
}

const opened = new Map<string, Promise<Backstage>>();

/**
 * Opens the Backstage folder at `folder`: reads `backstage.json` once a session and checks it.
 * Rejects with a `BackstageError` if it's missing, damaged or of another manifest version; a
 * failure isn't remembered, so the next call tries again.
 */
export function openBackstage(
  folder: string,
  options: { readonly fetch?: typeof globalThis.fetch } = {},
): Promise<Backstage> {
  const key = trimSlash(folder);
  let backstage = opened.get(key);
  if (!backstage) {
    backstage = read(key, options.fetch ?? globalThis.fetch);
    opened.set(key, backstage);
    backstage.catch(() => opened.delete(key));
  }
  return backstage;
}

async function read(folder: string, fetch: typeof globalThis.fetch): Promise<Backstage> {
  const url = `${folder}/backstage.json`;
  let text: string;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    text = await res.text();
  } catch (e) {
    throw new BackstageError('missing', MISSING, [`${url}: ${(e as Error).message}`]);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new BackstageError('damaged', DAMAGED, [`${url}: ${(e as Error).message}`]);
  }
  return backstageFrom(json as BackstageManifest, folder);
}

/** For tests: forget the Backstages opened this session. */
export function forgetOpenedBackstages(): void {
  opened.clear();
}

/**
 * Several Backstages as one: the shipped one first, then a class's. An id is answered by the
 * first that has it, so a class's import can't stand in for a shipped model.
 */
export function combineBackstages(...backstages: readonly Backstage[]): Backstage {
  const owner = new Map<Id, Backstage>();
  for (const b of backstages) for (const i of b.items) if (!owner.has(i.id)) owner.set(i.id, b);
  const items = [...owner].map(([id, b]) => b.item(id)!);
  return {
    items,
    item: (id) => owner.get(id)?.item(id),
    find: (id) => owner.get(id)?.find(id) ?? null,
    thumbnail: (id) => owner.get(id)?.thumbnail(id) ?? null,
    credits: () => creditsBySection(items),
    catalogue: () => catalogueText({ manifestVersion: MANIFEST_VERSION, items }),
  };
}
