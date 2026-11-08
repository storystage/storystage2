/**
 * WP4.8: the Story API as an open specification (`docs/story-api/`). `buildCatalog` turns the
 * metadata into `story-api.json`, the file other implementers read, and `CATALOG_SCHEMA` is its
 * JSON Schema. Both are Apache-2.0, like the code; the readable reference is CC BY 4.0
 * (decision 0055).
 *
 * What stays out: how StoryStage runs each block (`runs`, `STAGE_NEEDS`), which is this
 * implementation's business, not the specification's.
 */
import { MOVE_AXES, ROLL_AXES, TURN_AXES } from './axes.ts';
import { DETAILS } from './details.ts';
import { CLASS_MAP, DROPPED, DROPPED_VALUES } from './dropped.ts';
import { ENTRIES } from './entries.ts';
import { EVENTS } from './events.ts';
import {
  ABSTRACT_CLASSES,
  ADDED_ENUMS,
  BASIC_TYPES,
  CLASS_PARENTS,
  ENUMS,
  REFERENCE_TYPES,
  TEXT_REFERENCES,
} from './types.ts';
import type { ApiClass, ParamDef } from './types.ts';
import words from '../strings/en-GB.json' with { type: 'json' };

/** The specification's own version. 0.x is a draft: anything may change (decision 0055). */
export const STORY_API_VERSION = '0.9.0';
export const STORY_API_STATUS = 'draft';

const [major, minor] = STORY_API_VERSION.split('.');
/** Where the files are named. The addresses are identifiers: they needn't resolve yet. */
export const SPEC_BASE = `https://storystage.org/spec/story-api/${major === '0' ? `${major}.${minor}` : major}`;
export const CATALOG_ID = `${SPEC_BASE}/story-api.json`;
export const CATALOG_SCHEMA_ID = `${SPEC_BASE}/story-api.schema.json`;
/** Numbered by the program format's major version, which is S2's (`SCHEMA_VERSION`), not ours. */
export const PROGRAM_SCHEMA_ID = 'https://storystage.org/spec/program/1/program.schema.json';

const word = (key: string): string => {
  const found = (words as Readonly<Record<string, string>>)[key];
  if (found === undefined) throw new Error(`No words for ${key}.`);
  return found;
};

/** Why a type's values were left out, where it isn't simply that no kept block uses them. */
const VALUES_LEFT_OUT: Readonly<Record<string, string>> = {
  Key: 'Only the keys listed under `Key` are kept: function keys, keypads and input-method keys are left out, because many school keyboards and iPads lack them.',
  TimerFrequency:
    '“As often as possible” can’t work with a time-slice budget, so a timer always has a number of seconds.',
};

const param = (p: ParamDef, words: string) => ({
  name: p.name,
  type: p.type,
  ...(p.range ? { range: p.range } : {}),
  words,
});

const aliceClasses = (cls: ApiClass) =>
  Object.entries(CLASS_MAP)
    .filter(([, ours]) => ours === cls)
    .map(([alice]) => alice);

/** `story-api.json`: the whole vocabulary, as data. */
export function buildCatalog() {
  return {
    $schema: CATALOG_SCHEMA_ID,
    $id: CATALOG_ID,
    version: STORY_API_VERSION,
    status: STORY_API_STATUS,
    language: 'en-GB',
    space: {
      units: 'metres, seconds and whole turns (0.25 is a quarter turn)',
      axes: 'glTF: right-handed, Y up, and a model faces +Z. Each direction is in the object’s own axes.',
      move: MOVE_AXES,
      turn: TURN_AXES,
      roll: ROLL_AXES,
    },
    classes: (Object.keys(CLASS_PARENTS) as ApiClass[]).map((cls) => ({
      name: cls,
      extends: CLASS_PARENTS[cls],
      abstract: (ABSTRACT_CLASSES as readonly string[]).includes(cls),
      words: word(`class.${cls}`),
      fromAlice: aliceClasses(cls),
    })),
    types: {
      basic: [...BASIC_TYPES],
      references: [...REFERENCE_TYPES],
      writtenAsText: [...TEXT_REFERENCES],
    },
    values: Object.entries(ENUMS).map(([name, values]) => ({
      name,
      origin: (ADDED_ENUMS as readonly string[]).includes(name) ? 'storystage' : 'alice',
      values: values.map((value) => ({ name: value, words: word(`value.${name}.${value}`) })),
    })),
    details: Object.entries(DETAILS).map(([name, d]) => ({
      name,
      type: d.type,
      default: d.default,
      ...(d.defaultMeans ? { defaultMeans: d.defaultMeans } : {}),
      ...(d.range ? { range: d.range } : {}),
      words: word(`detail.${name}`),
    })),
    blocks: ENTRIES.map((e) => ({
      class: e.on,
      name: e.name,
      kind: e.kind,
      params: e.params.map((p) => param(p, word(`param.${p.name}`))),
      ...(e.kind === 'function' ? { returns: e.returns } : {}),
      details: [...e.details],
      words: word(`entry.${e.on}.${e.name}`),
      origin: e.task === '4.3' ? 'alice' : 'storystage',
      fromAlice: [...e.alice],
      crosswalk: { ...(e.bml ? { bml: e.bml } : {}), unreal: e.unreal },
    })),
    events: EVENTS.map((e) => ({
      name: e.name,
      needs: e.args.map((p) => param(p, word(`param.${p.name}`))),
      gives: e.gives.map((g) => ({
        ...param(g, word(`param.${g.name}`)),
        fromAlice: [...(g.alice ?? [])],
      })),
      details: [...e.details],
      words: word(`event.${e.name}`),
      fromAlice: [...e.alice],
      crosswalk: { unreal: e.unreal },
    })),
    dropped: [
      ...DROPPED.map((g) => ({ members: [...g.members], why: g.why })),
      ...Object.entries(DROPPED_VALUES).map(([type, list]) => ({
        members: list === 'rest' ? [`${type}.*`] : list.map((v) => `${type}.${v}`),
        why: VALUES_LEFT_OUT[type] ?? 'No block that is kept uses it.',
      })),
    ],
  };
}

export type Catalog = ReturnType<typeof buildCatalog>;

const NAME = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9]*$' } as const;
const TYPE = { type: 'string', pattern: '^[A-Z][A-Za-z]*(\\[\\])?$' } as const;
const WORDS = { type: 'string', minLength: 1 } as const;
/** Alice's members (`SThing.delay`), and her classes (`SThing`). */
const ALICE = {
  type: 'array',
  items: { type: 'string', pattern: '^[A-Za-z]+\\.[A-Za-z*]+$' },
} as const;
const ALICE_CLASSES = {
  type: 'array',
  items: { type: 'string', pattern: '^S[A-Z][A-Za-z]*$' },
} as const;
const NAMES = { type: 'array', items: NAME, uniqueItems: true } as const;
const object = (required: readonly string[], properties: Record<string, unknown>) => ({
  type: 'object',
  required,
  additionalProperties: false,
  properties,
});

/** The JSON Schema (2020-12) for `story-api.json`. */
export const CATALOG_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: CATALOG_SCHEMA_ID,
  title: 'StoryStage Story API catalog',
  description:
    'The classes, blocks, details, values and events of the StoryStage Story API, with their words in one language.',
  ...object(
    [
      'version',
      'status',
      'language',
      'space',
      'classes',
      'types',
      'values',
      'details',
      'blocks',
      'events',
      'dropped',
    ],
    {
      $schema: { type: 'string' },
      $id: { type: 'string' },
      version: { type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$' },
      status: { enum: ['draft', 'stable'] },
      language: { type: 'string' },
      space: object(['units', 'axes', 'move', 'turn', 'roll'], {
        units: WORDS,
        axes: WORDS,
        move: { $ref: '#/$defs/directions' },
        turn: { $ref: '#/$defs/directions' },
        roll: { $ref: '#/$defs/directions' },
      }),
      classes: {
        type: 'array',
        items: object(['name', 'extends', 'abstract', 'words', 'fromAlice'], {
          name: NAME,
          extends: { oneOf: [NAME, { type: 'null' }] },
          abstract: { type: 'boolean' },
          words: WORDS,
          fromAlice: ALICE_CLASSES,
        }),
      },
      types: object(['basic', 'references', 'writtenAsText'], {
        basic: NAMES,
        references: NAMES,
        writtenAsText: NAMES,
      }),
      values: {
        type: 'array',
        items: object(['name', 'origin', 'values'], {
          name: NAME,
          origin: { $ref: '#/$defs/origin' },
          values: {
            type: 'array',
            items: object(['name', 'words'], { name: NAME, words: WORDS }),
          },
        }),
      },
      details: {
        type: 'array',
        items: object(['name', 'type', 'default', 'words'], {
          name: NAME,
          type: TYPE,
          default: { oneOf: ['number', 'boolean', 'string', 'null'].map((type) => ({ type })) },
          defaultMeans: WORDS,
          range: { $ref: '#/$defs/range' },
          words: WORDS,
        }),
      },
      blocks: {
        type: 'array',
        items: object(
          [
            'class',
            'name',
            'kind',
            'params',
            'details',
            'words',
            'origin',
            'fromAlice',
            'crosswalk',
          ],
          {
            class: NAME,
            name: NAME,
            kind: { enum: ['procedure', 'function'] },
            params: { type: 'array', items: { $ref: '#/$defs/param' } },
            returns: TYPE,
            details: NAMES,
            words: WORDS,
            origin: { $ref: '#/$defs/origin' },
            fromAlice: ALICE,
            crosswalk: { $ref: '#/$defs/crosswalk' },
          },
        ),
      },
      events: {
        type: 'array',
        items: object(['name', 'needs', 'gives', 'details', 'words', 'fromAlice', 'crosswalk'], {
          name: NAME,
          needs: { type: 'array', items: { $ref: '#/$defs/param' } },
          gives: {
            type: 'array',
            items: object(['name', 'type', 'words', 'fromAlice'], {
              name: NAME,
              type: TYPE,
              range: { $ref: '#/$defs/range' },
              words: WORDS,
              fromAlice: ALICE,
            }),
          },
          details: NAMES,
          words: WORDS,
          fromAlice: ALICE,
          crosswalk: { $ref: '#/$defs/crosswalk' },
        }),
      },
      dropped: {
        type: 'array',
        items: object(['members', 'why'], {
          members: { type: 'array', items: { type: 'string' }, minItems: 1 },
          why: WORDS,
        }),
      },
    },
  ),
  $defs: {
    origin: { enum: ['alice', 'storystage'] },
    vector: object(['x', 'y', 'z'], {
      x: { type: 'number' },
      y: { type: 'number' },
      z: { type: 'number' },
    }),
    directions: { type: 'object', additionalProperties: { $ref: '#/$defs/vector' } },
    range: { enum: ['portion', 'positive', 'positiveOrZero'] },
    param: object(['name', 'type', 'words'], {
      name: NAME,
      type: TYPE,
      range: { $ref: '#/$defs/range' },
      words: WORDS,
    }),
    crosswalk: object(['unreal'], { bml: NAME, unreal: WORDS }),
  },
} as const;
