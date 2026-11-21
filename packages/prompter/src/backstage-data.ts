/**
 * The Backstage catalogue a request carries (`docs/spec/04-prompter.md` section 2.7, the owner's
 * choice of 21 Nov 2026). `system` holds the index, every shipped model in one short line; each
 * turn's `<backstage_data>` holds the full lines of the models the request needs, with the joints
 * of the sets they name, and `find_models` gives any other. The catalogue's form and its search
 * are S4's (`@storystage/backstage`); what goes, in what order and within what budget is here.
 */
import {
  jointsFor,
  searchCatalogue,
  type Catalogue,
  type CatalogueItem,
  type Section,
} from '@storystage/backstage';
import type { FrameId, Production, SceneId } from '@storystage/production';
import type { JsonObject } from './transport.ts';

/** Section 2.7: a turn's `<backstage_data>`, joint lists and all. */
export const BACKSTAGE_DATA_TOKEN_BUDGET = 6_000;
/** How many models one search, or one `find_models` call, gives at most. */
export const FIND_MODELS_LIMIT = 20;

/** Where the learner is, and what they asked, for choosing models. */
export interface BackstageAbout {
  readonly scene: SceneId;
  /** The frame the request is about, if it names one. */
  readonly frame?: FrameId | null;
  readonly request: string;
}

/**
 * The models a request may need, most needed first, each once (section 2.7): those the production
 * already uses, the current scene's first; then the best matches for the request's words; then
 * for the frame's caption and script lines, then the scene's.
 */
export function backstageCandidates(
  catalogue: Catalogue,
  p: Production,
  about: BackstageAbout,
): CatalogueItem[] {
  const byId = new Map(catalogue.items.map((i) => [i.id, i] as const));
  const chosen = new Map<string, CatalogueItem>();
  const add = (items: Iterable<CatalogueItem | undefined>) => {
    for (const item of items) if (item && !chosen.has(item.id)) chosen.set(item.id, item);
  };
  const shipped = (model: unknown) => (typeof model === 'string' ? byId.get(model) : undefined);
  // The current scene's first.
  const here = <T>(xs: readonly T[], scene: (x: T) => SceneId) => [
    ...xs.filter((x) => scene(x) === about.scene),
    ...xs.filter((x) => scene(x) !== about.scene),
  ];

  for (const s of here(p.scenes, (s) => s.id)) {
    add(s.setup.objects.map((o) => shipped(o.model)));
    const { ground, sky, lighting } = s.setup.backdrop;
    add([ground, sky, lighting].map(shipped));
  }
  for (const f of here(p.frames, (f) => f.scene)) add(f.sketches.map((k) => shipped(k.item)));

  const search = (words: readonly string[]) =>
    searchCatalogue(catalogue.items, words, { limit: FIND_MODELS_LIMIT });
  add(search([about.request]));
  const frame = about.frame ? p.frames.find((f) => f.id === about.frame) : undefined;
  if (frame)
    add(
      search([
        frame.caption,
        ...p.script.filter((l) => l.pinnedFrame === frame.id).map((l) => l.text),
      ]),
    );
  add(
    search([
      ...p.frames.filter((f) => f.scene === about.scene).map((f) => f.caption),
      ...p.script.filter((l) => l.scene === about.scene).map((l) => l.text),
    ]),
  );
  return [...chosen.values()];
}

/** What a conversation has sent of the catalogue: models by id, and joint sets by name. */
export interface BackstageSent {
  readonly models: ReadonlySet<string>;
  readonly sets: ReadonlySet<string>;
}

export const NOTHING_SENT: BackstageSent = { models: new Set(), sets: new Set() };

/**
 * A turn's `<backstage_data>`: the candidates' full lines not yet sent in this conversation, and
 * the joints of each set they name that wasn't either, in order, stopping before the next would
 * pass the budget. `undefined` when there is nothing new to send.
 */
export function backstageBlock(
  catalogue: Catalogue,
  candidates: readonly CatalogueItem[],
  sent: BackstageSent,
  budget: number = BACKSTAGE_DATA_TOKEN_BUDGET,
): { readonly block: JsonObject | undefined; readonly sent: BackstageSent } {
  const models = new Set(sent.models);
  const sets = new Set(sent.sets);
  const lines: string[] = [];
  const joints: Record<string, readonly string[]> = {};
  // Characters exactly as the block is written, `{"models":[…],"joints":{…}}`, counted at three a
  // token as everywhere (section 2.1).
  let size = JSON.stringify({ models: [], joints: {} }).length;
  for (const item of candidates) {
    if (models.has(item.id)) continue;
    const set = item.joints !== 'none' && !sets.has(item.joints) ? item.joints : null;
    const list = set === null ? undefined : catalogue.joints[set];
    // A comma before each entry but the first, and a colon in each set's.
    const more =
      JSON.stringify(item.line).length +
      (lines.length ? 1 : 0) +
      (list === undefined
        ? 0
        : JSON.stringify(set).length +
          1 +
          JSON.stringify(list).length +
          (Object.keys(joints).length ? 1 : 0));
    if (Math.ceil((size + more) / 3) > budget) break;
    size += more;
    lines.push(item.line);
    models.add(item.id);
    if (set !== null && list !== undefined) {
      joints[set] = list;
      sets.add(set);
    }
  }
  return {
    block: lines.length ? { models: lines, joints } : undefined,
    sent: { models, sets },
  };
}

/** `find_models`' answer (section 3.1): the best matches' full lines, with their sets' joints. */
export function findModels(
  catalogue: Catalogue,
  query: string,
  section: Section | '',
): { readonly models: readonly string[]; readonly joints: Record<string, readonly string[]> } {
  const found = searchCatalogue(catalogue.items, query, {
    ...(section === '' ? {} : { section }),
    limit: FIND_MODELS_LIMIT,
  });
  return { models: found.map((i) => i.line), joints: jointsFor(catalogue, found) };
}
