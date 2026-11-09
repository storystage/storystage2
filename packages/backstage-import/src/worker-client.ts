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

// What the import screen shows: the licence step's choices and words, and the result's types.
export { LICENCE_CHOICES, LICENCE_PROBLEMS, MAKER_MAX, SOURCE_MAX } from './licence.ts';
export type { LicenceAnswers, LicenceChoice, LicenceProblem, LicenceRecord } from './licence.ts';
export type { ImportProblem, ImportProblemCode } from './checks.ts';
export type { ImportChoices, ImportReport, ImportResult, ImportedFile } from './import.ts';

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

/**
 * Runs one import in a fresh worker from `start`, and ends the worker when it answers, fails or
 * runs out of time. The picked files' bytes are copied in, so the caller keeps its own.
 */
export function importInWorker(
  start: () => ImportWorker,
  request: ImportRequest,
  options: { readonly timeLimitMs?: number } = {},
): Promise<ImportResult> {
  const worker = start();
  return new Promise<ImportResult>((resolve) => {
    let done = false;
    const finish = (result: ImportResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ ok: false, problems: [TOO_SLOW] }),
      options.timeLimitMs ?? IMPORT_TIME_LIMIT_MS,
    );
    worker.addEventListener('message', (event: { data: unknown }) => {
      const data = event.data as Partial<ImportAnswer> | null;
      if (data?.type === 'result' && data.result) finish(data.result);
    });
    worker.addEventListener('error', () => finish({ ok: false, problems: [IMPORT_BROKE] }));
    const files = request.files.map(([name, bytes]) => [name, bytes.slice()] as const);
    const message: ImportMessage = { type: 'import', request: { ...request, files } };
    worker.postMessage(
      message,
      files.map(([, bytes]) => bytes.buffer as ArrayBuffer),
    );
  });
}
