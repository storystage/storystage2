/**
 * Opening a program of any version, and the migrations that bring it up to date
 * (`docs/spec/01-ast.md`, section 7).
 */
import type { Program } from './nodes.ts';
import { validateProgram, type Problem } from './validate.ts';
import { SCHEMA_VERSION } from './version.ts';

type Json = Readonly<Record<string, unknown>>;

/** One step up: takes the JSON of `from`, returns the JSON of `to`. */
export interface Migration {
  readonly from: string;
  readonly to: string;
  readonly up: (json: Json) => Json;
}

/** Every migration so far. There are none: 1.0.0 is the first version. */
export const MIGRATIONS: readonly Migration[] = [];

export type Opened =
  /** The current version, and valid. */
  | { readonly status: 'ok'; readonly program: Program }
  /** Older, brought up to date and valid. WP8 keeps `original` beside the new file. */
  | {
      readonly status: 'migrated';
      readonly program: Program;
      readonly from: string;
      readonly original: unknown;
    }
  /** Newer: show it, with `message`, and open the session with `readOnly`. */
  | { readonly status: 'readOnly'; readonly program: Program; readonly message: string }
  | {
      readonly status: 'broken';
      /** In plain words, for the learner. */
      readonly message: string;
      /** For developers and logs. */
      readonly problems: readonly Problem[];
    };

export interface OpenOptions {
  /** The version this build reads. Tests pretend to be a later build. */
  readonly current?: string;
  readonly migrations?: readonly Migration[];
  /** Tests whose fake migrations don't produce real programs replace this. */
  readonly validate?: (json: unknown) => readonly Problem[];
}

const DAMAGED = "This file can't be opened: part of it is damaged.";
const TOO_OLD = "This film was made with a very old StoryStage, so this one can't open it.";
const NEWER =
  'This film was made with a newer StoryStage. You can watch it and read its code, but not change it. Update StoryStage to change it.';

const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const parts = (version: string) => version.split('.').map(Number) as [number, number, number];

/** Below zero if `a` is older than `b`, above if it's newer. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)];
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

const broken = (message: string, problems: readonly Problem[]): Opened => ({
  status: 'broken',
  message,
  problems,
});

const problem = (message: string): Problem => ({ code: 'shape', message, node: null });

/** Runs the migrations from `from` on a copy. `null` if nothing leads to `current`. */
function migrate(
  original: Json,
  from: string,
  current: string,
  migrations: readonly Migration[],
): Json | null {
  let json = JSON.parse(JSON.stringify(original)) as Json;
  let version = from;
  while (compareVersions(version, current) < 0) {
    const step = migrations.find((m) => m.from === version);
    if (step && compareVersions(step.to, version) > 0) {
      json = step.up(json);
      version = step.to;
    } else if (parts(version)[0] === parts(current)[0]) {
      // Within a major version a newer format only adds things, so an older file is already fine.
      return { ...json, schemaVersion: current };
    } else return null;
  }
  return json;
}

/** Reads a parsed `program.json`. Never changes what it's given. */
export function openProgram(value: unknown, options: OpenOptions = {}): Opened {
  const current = options.current ?? SCHEMA_VERSION;
  const validate = options.validate ?? ((json: unknown) => validateProgram(json));
  const version =
    typeof value === 'object' && value !== null
      ? (value as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  if (typeof version !== 'string' || !VERSION.test(version))
    return broken(DAMAGED, [problem('The program has no version.')]);

  const order = compareVersions(version, current);
  if (order > 0) {
    const problems = validateProgram(value, { lenient: true });
    if (problems.length > 0) return broken(DAMAGED, problems);
    return { status: 'readOnly', program: value as Program, message: NEWER };
  }
  if (order === 0) {
    const problems = validate(value);
    if (problems.length > 0) return broken(DAMAGED, problems);
    return { status: 'ok', program: value as Program };
  }

  let migrated: Json | null;
  try {
    migrated = migrate(value as Json, version, current, options.migrations ?? MIGRATIONS);
  } catch (e) {
    return broken(DAMAGED, [problem(`A migration failed: ${String(e)}`)]);
  }
  if (!migrated) return broken(TOO_OLD, [problem(`Nothing migrates ${version} to ${current}.`)]);
  const problems = validate(migrated);
  if (problems.length > 0) return broken(DAMAGED, problems);
  return {
    status: 'migrated',
    program: migrated as unknown as Program,
    from: version,
    original: value,
  };
}
