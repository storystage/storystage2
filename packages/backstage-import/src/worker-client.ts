/**
 * WP3.11, the studio's side of the import worker (spec 17, section 5): `importInWorker`, and
 * what the import screen needs to show its steps and the result. It's its own subpath,
 * `@storystage/backstage-import/worker-client`, and imports nothing heavy: `importModel`, glTF
 * Transform and meshoptimizer load only inside the worker (`import-worker.ts`). A test keeps it
 * that way.
 *
 * `importInWorker(start, request)` starts a fresh worker for each import, and ends it when it
 * answers or fails, or after `IMPORT_TIME_LIMIT_MS` with a refusal in plain words.
 */
import type { ImportProblem } from './checks.ts';
import type { ImportChoices, ImportResult } from './import.ts';
import type { FilmCheckResult, FilmModelInput } from './film-check.ts';

// What the import screen shows: the licence step's choices and words, and the result's types.
export { LICENCE_CHOICES, LICENCE_PROBLEMS, MAKER_MAX, SOURCE_MAX } from './licence.ts';
export type { LicenceAnswers, LicenceChoice, LicenceProblem, LicenceRecord } from './licence.ts';
export type { ImportProblem, ImportProblemCode } from './checks.ts';
export type { ImportChoices, ImportReport, ImportResult, ImportedFile } from './import.ts';
export type { FilmCheckResult, FilmModelInput } from './film-check.ts';

/** The longest an import may run (spec 17, section 5). */
export const IMPORT_TIME_LIMIT_MS = 60_000;

export interface ImportRequest {
  /** The picked files, by plain name. */
  readonly files: readonly (readonly [string, Uint8Array])[];
  readonly choices: ImportChoices;
  /** The ids the class Backstage has had, live and in the bin. */
  readonly taken: readonly string[];
}

/** To the worker. */
export interface ImportMessage {
  readonly type: 'import';
  readonly request: ImportRequest;
}

/** From the worker. */
export interface ImportAnswer {
  readonly type: 'result';
  readonly result: ImportResult;
}

/** What the studio's side needs from a worker. A real `Worker` fits. */
export interface ImportWorker {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
  terminate(): void;
}

/** A refusal when the import fails without saying why. */
export const IMPORT_BROKE: ImportProblem = {
  code: 'damaged',
  message: "This model couldn't be imported. It may be damaged.",
};

const TOO_SLOW: ImportProblem = {
  code: 'tooSlow',
  message:
    'This model took too long to import, so StoryStage stopped. Try a simpler version of it, or a smaller file.',
};

/** How `runInWorker` settles, besides an answer. */
export interface WorkerJobOptions<T> {
  /** The worker's answer, if this message is it; otherwise `undefined`, and it waits on. */
  readonly answer: (data: unknown) => T | undefined;
  /** What to settle with when the time limit passes. */
  readonly timedOut: () => T;
  /** What to settle with when the worker fails. */
  readonly failed: () => T;
  /** Default `IMPORT_TIME_LIMIT_MS`, 60 seconds (spec 15, section 3). */
  readonly timeLimitMs?: number;
}

/**
 * One job in a fresh worker from `start`, for any untrusted reader (spec 15, section 3): posts
 * `message` with its `transfer` list, and settles once, with the first answer, a failure, or
 * the time limit. The worker is always ended. `importInWorker` is built on it, and so can
 * another package's reader (S6's Alice worlds).
 */
export function runInWorker<T>(
  start: () => ImportWorker,
  message: unknown,
  transfer: Transferable[],
  options: WorkerJobOptions<T>,
): Promise<T> {
  const worker = start();
  return new Promise<T>((resolve) => {
    let done = false;
    const finish = (result: T) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(
      () => finish(options.timedOut()),
      options.timeLimitMs ?? IMPORT_TIME_LIMIT_MS,
    );
    worker.addEventListener('message', (event: { data: unknown }) => {
      const answer = options.answer(event.data);
      if (answer !== undefined) finish(answer);
    });
    worker.addEventListener('error', () => finish(options.failed()));
    worker.postMessage(message, transfer);
  });
}

/**
 * Runs one import in a fresh worker from `start`, and ends the worker when it answers, fails or
 * runs out of time. The picked files' bytes are copied in, so the caller keeps its own.
 */
export function importInWorker(
  start: () => ImportWorker,
  request: ImportRequest,
  options: { readonly timeLimitMs?: number } = {},
): Promise<ImportResult> {
  const files = request.files.map(([name, bytes]) => [name, bytes.slice()] as const);
  const message: ImportMessage = { type: 'import', request: { ...request, files } };
  return runInWorker<ImportResult>(
    start,
    message,
    files.map(([, bytes]) => bytes.buffer as ArrayBuffer),
    {
      answer: (data) => {
        const d = data as Partial<ImportAnswer> | null;
        return d?.type === 'result' && d.result ? d.result : undefined;
      },
      timedOut: () => ({ ok: false, problems: [TOO_SLOW] }),
      failed: () => ({ ok: false, problems: [IMPORT_BROKE] }),
      ...(options.timeLimitMs !== undefined ? { timeLimitMs: options.timeLimitMs } : {}),
    },
  );
}

/** To the worker: check a film's packed models before they reach the stage. */
export interface FilmCheckMessage {
  readonly type: 'checkFilm';
  readonly models: readonly FilmModelInput[];
  /** The film's model files, by `models/<folder>/<path>`. */
  readonly files: readonly (readonly [string, Uint8Array])[];
}

/** From the worker. */
export interface FilmCheckAnswer {
  readonly type: 'filmChecked';
  readonly result: FilmCheckResult;
}

/**
 * Checks a film's packed models in a fresh worker (`checkFilmModels`; spec 03, section 1.3), and
 * ends the worker when it answers, fails or runs out of time. If it can't finish, every model is
 * refused, so nothing unchecked reaches the stage. The film's bytes are copied in.
 */
export function checkFilmInWorker(
  start: () => ImportWorker,
  models: readonly FilmModelInput[],
  files: ReadonlyMap<string, Uint8Array>,
  options: { readonly timeLimitMs?: number } = {},
): Promise<FilmCheckResult> {
  const copies = [...files].map(([path, bytes]) => [path, bytes.slice()] as const);
  const message: FilmCheckMessage = { type: 'checkFilm', models, files: copies };
  const none = (reason: string): FilmCheckResult => ({
    checked: [],
    refused: models.map((m) => ({ folder: m.folder, name: 'A model', reason })),
  });
  return runInWorker<FilmCheckResult>(
    start,
    message,
    copies.map(([, bytes]) => bytes.buffer as ArrayBuffer),
    {
      answer: (data) => {
        const d = data as Partial<FilmCheckAnswer> | null;
        return d?.type === 'filmChecked' && d.result ? d.result : undefined;
      },
      timedOut: () =>
        none("Its imported models took too long to check, so they're shown as outlines."),
      failed: () => none("Its imported models couldn't be checked, so they're shown as outlines."),
      ...(options.timeLimitMs !== undefined ? { timeLimitMs: options.timeLimitMs } : {}),
    },
  );
}
