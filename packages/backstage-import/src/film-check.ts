/**
 * Checking a film's packed models before they reach the stage (decision 0049; spec 03, section
 * 1.3: "A packed model is an import. It's checked as any import is"; spec 15, section 3.4, F8, F9).
 * A film from another device, or one picked with Open, is untrusted, so each model it carries is
 * checked as the import checks one, in the import worker, before `filmBackstage` gives its files
 * to the stage. S2 found that nothing did.
 *
 * For each packed model:
 * - **the record** is a valid imported model's, and its folder a safe name;
 * - **the model** is a `.glb` that passes the import's checks (its JSON, every accessor's size,
 *   every picture's header, the ceilings), reads cleanly, and fits its section's budget. It isn't
 *   reduced or redrawn: it was when it was imported;
 * - **the thumbnail** is a PNG or WebP within the picture limits;
 * - **every sketch** is an SVG of exactly what Backstage's sketch renderer writes: `svg`, `title`
 *   and `path` with their own attributes, nothing else. The studio shows sketches, so a sketch is
 *   never allowed to carry a script, a link or an entity.
 *
 * Models that pass are listed in `checked`; the others in `refused`, with the reason in plain
 * words. `filmBackstage(models, files, { checked })` then shows only the checked ones.
 */
import { ITEM_BUDGETS, MANIFEST_VERSION, validateManifest } from '@storystage/backstage';
import { countTriangles, largestTexture } from '@storystage/backstage/optimize';
import { checkPicture } from './checks.ts';
import { checkEmbeddedPictures, readPicked } from './import.ts';

/** A film's packed model, as `manifest.models` lists it. */
export interface FilmModelInput {
  readonly folder: string;
  readonly item: unknown;
}

export interface FilmCheckResult {
  /** The folders whose models passed. */
  readonly checked: readonly string[];
  /** The others, with the model's name where it has one, and why, in plain words. */
  readonly refused: readonly {
    readonly folder: string;
    readonly name: string;
    readonly reason: string;
  }[];
}

const SAFE_FOLDER = /^[a-z0-9][a-z0-9-]{0,31}$/;

const SIZE = /^\d{1,6}(\.\d{1,6})?$/;
const PAINT = /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|none)$/;

/**
 * What each element of a sketch may carry, and what each value may be: exactly what the sketch
 * renderer writes (`packages/sketches/src/render.ts`). So no value can reach outside the sketch,
 * as `fill="url(…)"` could if the studio ever put a sketch into the page (S2's review).
 */
const SKETCH_ATTRIBUTES: Readonly<Record<string, Readonly<Record<string, RegExp>>>> = {
  svg: {
    xmlns: /^http:\/\/www\.w3\.org\/2000\/svg$/,
    viewBox: /^\d{1,6}(\.\d{1,6})? \d{1,6}(\.\d{1,6})? \d{1,6}(\.\d{1,6})? \d{1,6}(\.\d{1,6})?$/,
    width: SIZE,
    height: SIZE,
    'data-facing': /^(front|threeQuarter|side|back)$/,
    'data-pose': /^[a-z]{1,20}$/,
    'data-backstage-id': /^[A-Za-z0-9/_.-]{1,200}$/,
  },
  title: {},
  path: {
    class: /^(fill|detail|outline)$/,
    // Moves, lines and closes, with numbers: what the renderer's paths are made of.
    d: /^[MLZ0-9 .e-]*$/,
    fill: PAINT,
    'fill-rule': /^(evenodd|nonzero)$/,
    stroke: PAINT,
    'stroke-width': SIZE,
    'stroke-linecap': /^(round|butt|square)$/,
    'stroke-linejoin': /^(round|miter|bevel)$/,
  },
};

/**
 * Whether `text` is a sketch as Backstage's renderer writes it: one `svg` element of `title` and
 * `path` elements, with only their own attributes, and plain text in the title. No scripts,
 * links, styles, entities, comments or processing instructions.
 */
export function isSafeSketch(text: string): boolean {
  if (text.length > 2_000_000) return false;
  const body = text.trim();
  if (!body.startsWith('<svg') || !body.endsWith('</svg>')) return false;
  // Nothing but plain tags: no comments, CDATA, doctype, entities beyond the five, or `<?`.
  if (/<[!?]/.test(body)) return false;
  if (/&(?!(amp|lt|gt|quot|apos);)/.test(body)) return false;
  const open: string[] = [];
  let at = 0;
  let svgs = 0;
  // A linear scan, tag by tag, so no file can make it slow (CodeQL, js/polynomial-redos).
  while (at < body.length) {
    const lt = body.indexOf('<', at);
    if (lt < 0) return false; // text after the last tag
    if (body.slice(at, lt).trim() !== '' && open.at(-1) !== 'title') return false;
    const gt = body.indexOf('>', lt);
    if (gt < 0) return false;
    let inner = body.slice(lt + 1, gt);
    const closing = inner.startsWith('/');
    if (closing) inner = inner.slice(1);
    const selfClosing = inner.endsWith('/');
    if (selfClosing) inner = inner.slice(0, -1);
    const name = /^[a-zA-Z]+/.exec(inner)?.[0];
    const allowed =
      name && Object.hasOwn(SKETCH_ATTRIBUTES, name) ? SKETCH_ATTRIBUTES[name] : undefined;
    if (!name || !allowed) return false;
    // Attributes one at a time, with a sticky pattern, so nothing is copied, and each is refused
    // as soon as its name, a repeat or its value isn't what the renderer writes: linear in the
    // file, however it's made (S2's review).
    const attribute = /\s+([a-zA-Z:-]+)="([^"]*)"/y;
    attribute.lastIndex = name.length;
    const seen = new Set<string>();
    for (;;) {
      const from = attribute.lastIndex;
      const a = attribute.exec(inner);
      if (!a) {
        if (inner.slice(from).trim() !== '') return false;
        break;
      }
      const [, key, value] = a;
      const rule = Object.hasOwn(allowed, key!) ? allowed[key!] : undefined;
      if (closing || !rule || seen.has(key!) || !rule.test(value!)) return false;
      seen.add(key!);
    }
    if (closing) {
      if (selfClosing || open.pop() !== name) return false;
    } else {
      if (name === 'svg') {
        if (open.length > 0 || ++svgs > 1) return false;
      } else if (open.at(-1) !== 'svg') return false;
      if (!selfClosing) open.push(name);
    }
    at = gt + 1;
  }
  return open.length === 0 && svgs === 1;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

/** Checks every packed model of a film. Never throws: a model that can't be checked is refused. */
export async function checkFilmModels(
  models: readonly FilmModelInput[],
  files: ReadonlyMap<string, Uint8Array>,
): Promise<FilmCheckResult> {
  const checked: string[] = [];
  const refused: { folder: string; name: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const { folder, item: record } of models) {
    const named = (record as { displayName?: unknown } | null)?.displayName;
    const name = typeof named === 'string' ? named.slice(0, 80) : 'A model';
    const refuse = (reason: string) => refused.push({ folder, name, reason });
    if (typeof folder !== 'string' || !SAFE_FOLDER.test(folder) || seen.has(folder)) {
      refuse('Its place in the film is damaged.');
      continue;
    }
    seen.add(folder);
    const valid = validateManifest({ manifestVersion: MANIFEST_VERSION, items: [record] });
    if (!valid.ok) {
      refuse('Its record in the film is damaged.');
      continue;
    }
    const item = valid.manifest.items[0]!;
    if (
      item.origin !== 'imported' ||
      !item.id.startsWith('class/') ||
      item.licence === 'permission'
    ) {
      refuse("It isn't a class's imported model.");
      continue;
    }
    const file = (path: string) => files.get(`models/${folder}/${path}`);
    try {
      // The model, as the import reads one.
      const model = file(item.files.model);
      if (!model || !item.files.model.endsWith('.glb')) {
        refuse('Its model is missing from the film.');
        continue;
      }
      const read = await readPicked(new Map([['model.glb', model]]));
      if (!read.ok) {
        refuse(read.problems.map((p) => p.message).join(' '));
        continue;
      }
      const pictures = checkEmbeddedPictures(read.doc);
      if (pictures) {
        refuse(pictures.message);
        continue;
      }
      const budget = ITEM_BUDGETS[item.section];
      if (
        countTriangles(read.doc) > budget.triangles ||
        largestTexture(read.doc) > budget.textureMaxPx
      ) {
        refuse('It is more detailed than StoryStage allows, so it may have been changed.');
        continue;
      }
      // Its thumbnail and sketches.
      const thumbnail = file(item.files.thumbnail);
      const thumbProblem = thumbnail
        ? checkPicture(thumbnail)
        : { message: 'Its picture is missing.' };
      if (thumbProblem) {
        refuse(thumbProblem.message);
        continue;
      }
      const badSketch = item.sketches.find((s) => {
        const bytes = file(s.file);
        if (!bytes || !s.file.endsWith('.svg')) return true;
        try {
          return !isSafeSketch(decoder.decode(bytes));
        } catch {
          return true;
        }
      });
      if (badSketch) {
        refuse('One of its sketches is damaged, or is not a StoryStage sketch.');
        continue;
      }
      checked.push(folder);
    } catch {
      refuse("It couldn't be checked, so it's shown as an outline.");
    }
  }
  return { checked, refused };
}
