/**
 * WP9.2 and 9.3: an Alice 3 world (`.a3p`) as a one-scene StoryStage production, with a report of
 * everything that couldn't come across as it was (spec 19, sections 7 and 8; decision 0069).
 *
 * `importAliceWorld` reads the file safely (`readA3p`, 9.1), decodes Alice's XML, turns the scene
 * and its start into the set-up (`importSetUp`), the code into the program (`buildProgram`), and
 * puts them in a production marked `origin: 'alice'`, so a teacher can relax the storyboard rule
 * for it (WP10.8). The production always passes `checkReferences`, so it can be saved and opened.
 */
import { ALICE_GROUNDS } from '@storystage/backstage';
import {
  checkReferences,
  FORMAT_VERSION,
  sceneId,
  type Production,
  type SceneCard,
} from '@storystage/production';
import type { BackstageId, StandIn, Vec3 } from '@storystage/story-api';
import { buildProgram } from './code.ts';
import { AliceDecodeError, decodeAlice, type AliceNode } from './decode.ts';
import type { GapKind, ImportGap } from './gaps.ts';
import { readA3p, type A3pProblem, type ReadA3pOptions } from './read.ts';
import { importSetUp, type WorldOptions } from './world.ts';

export interface ImportOptions extends WorldOptions, ReadA3pOptions {
  /** The file's name: the production's title is it without `.a3p` (spec 19, section 8). */
  readonly fileName?: string;
  /** This build of StoryStage, for the manifest's `createdWith`. */
  readonly appVersion?: string;
  /**
   * Backstage's models as data, for a worker, which can't call back to the page: each Alice
   * gallery key (`Prop/MangoTree`, or with its variant, `Prop/MangoTree/DEFAULT`) to the model's
   * id and its height at scale 1 (`defaultSize.height`). The variant's key is tried first. Used
   * where `findModel` or `modelHeight` isn't given.
   */
  readonly models?: ReadonlyMap<string, AliceModel>;
}

/** One Backstage model, for `ImportOptions.models`. */
export interface AliceModel {
  readonly id: string;
  readonly height?: number | null;
}

/** `findModel` and `modelHeight` from `models`, where they aren't given themselves. */
function lookups(options: ImportOptions): WorldOptions {
  const { models } = options;
  if (!models) return options;
  const heights = new Map<string, number>();
  for (const m of models.values()) if (m.height && m.height > 0) heights.set(m.id, m.height);
  return {
    ...options,
    findModel:
      options.findModel ??
      ((key, variant) =>
        (models.get(`${key}/${variant}`)?.id ?? models.get(key)?.id ?? null) as BackstageId | null),
    modelHeight: options.modelHeight ?? ((id) => heights.get(id) ?? null),
  };
}

/** The report the studio shows after an import (spec 19, section 7). */
export interface ImportReport {
  /** Every gap, in the order the import met them. */
  readonly gaps: readonly ImportGap[];
  /** How many of each kind, for the report's headings. */
  readonly counts: Readonly<Record<GapKind, number>>;
}

export type ImportResult =
  | {
      readonly ok: true;
      readonly production: Production;
      readonly report: ImportReport;
      /**
       * Alice's size, in metres, for each Backstage model Backstage gives no size for. A stand-in
       * carries its own (`StandIn.size`).
       */
      readonly sizes: ReadonlyMap<string, Vec3>;
    }
  | {
      readonly ok: false;
      /**
       * The reader's, `notAWorld` for a class on its own, or, from the worker, `broke` (a bug
       * here) and `timedOut` (over spec 15's 60 seconds). Each `message` is in plain words.
       */
      readonly problem:
        | A3pProblem
        | { readonly code: 'notAWorld' | 'broke' | 'timedOut'; readonly message: string };
    };

const KINDS: readonly GapKind[] = ['model', 'setUp', 'class', 'block', 'value', 'event', 'unknown'];

/** `wonderland.a3p` is "wonderland"; no name at all is "Alice world". */
const titleOf = (fileName: string | undefined) => {
  const base = (fileName ?? '')
    .replace(/^.*[\\/]/, '')
    .replace(/\.a3p$/i, '')
    .trim();
  return base === '' ? 'Alice world' : base;
};

/** Reads an Alice 3 world and turns it into a production, or says in plain words why it can't. */
export function importAliceWorld(bytes: Uint8Array, options: ImportOptions = {}): ImportResult {
  const read = readA3p(bytes, options.limits ? { limits: options.limits } : {});
  if (!read.ok) return read;
  if (read.file.kind !== 'world')
    return {
      ok: false,
      problem: {
        code: 'notAWorld',
        message: 'This is one Alice class on its own, not a world, so there’s no scene to import.',
      },
    };

  let alice: AliceNode;
  try {
    alice = decodeAlice(read.file.program);
  } catch (e) {
    if (!(e instanceof AliceDecodeError)) throw e;
    return {
      ok: false,
      problem: { code: 'badXml', message: 'This Alice world is damaged, so it wasn’t opened.' },
    };
  }

  return importDecodedWorld(alice, options);
}

/** The production for a world already read and decoded: `importAliceWorld`'s second half. */
export function importDecodedWorld(
  alice: AliceNode,
  options: ImportOptions = {},
): Extract<ImportResult, { ok: true }> {
  const world = importSetUp(alice, { grounds: ALICE_GROUNDS, ...lookups(options) });
  const built = buildProgram(alice, world);
  const scene = sceneId('s1');

  // The scene's card names its cast, each model once.
  const cast: (BackstageId | StandIn)[] = [];
  const seen = new Set<string>();
  for (const object of world.setup.objects) {
    const key = typeof object.model === 'string' ? object.model : `standIn:${object.model.standIn}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cast.push(object.model);
  }
  const card: SceneCard = { id: scene, heading: world.sceneName, cast, arcPart: null };

  const production: Production = {
    manifest: {
      format: 'storystage',
      formatVersion: FORMAT_VERSION,
      createdWith: { app: 'StoryStage', version: options.appVersion ?? '0.0.0' },
      title: titleOf(options.fileName),
      origin: 'alice',
      runningOrder: [{ scene, transition: { kind: 'cut', duration: 0 } }],
      audio: [],
      models: [],
    },
    program: built.program,
    scenes: [{ id: scene, setup: world.setup, method: built.sceneMethod }],
    storyboard: { logline: '', synopsis: '', arc: { template: 'free', parts: [] }, cards: [card] },
    script: [],
    frames: [],
  };

  // The import makes what `checkReferences` asks for; anything else is a bug here, not the file's.
  const problems = checkReferences(production);
  if (problems.length > 0)
    throw new Error(`An imported world fails checkReferences: ${problems[0]}`);

  const gaps = [...world.gaps, ...built.gaps];
  const counts = Object.fromEntries(
    KINDS.map((k) => [k, gaps.filter((g) => g.kind === k).length]),
  ) as Record<GapKind, number>;
  return { ok: true, production, report: { gaps, counts }, sizes: world.sizes };
}
