/**
 * WP3.11: the import runs in a Web Worker of its own (`00-architecture.md`, section 3; spec 15,
 * section 3.4), so a hostile or huge model can't freeze the studio, and it's stopped after 60
 * seconds (spec 17, section 5).
 *
 * - `serveImports(port, tools)` is the worker's side: it answers each `import` message with
 *   `importModel`'s result. `import-worker.ts` runs it in a real worker with the browser's tools.
 * - `importInWorker(start, request)` is the studio's side: a fresh worker for each import, ended
 *   when the answer comes, or after `IMPORT_TIME_LIMIT_MS` with a refusal in plain words.
 *
 * The worker has no network of its own to use: the import reads only the bytes it's sent, and
 * the app's content security policy blocks requests from workers as well (F9).
 */
import type { ImportProblem } from './checks.ts';
import { importModel, type ImportChoices, type ImportResult, type ImportTools } from './import.ts';

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

/** What the worker's side needs from its port: `self` in a worker, or one end of a channel. */
export interface WorkerPort {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

const isImport = (data: unknown): data is ImportMessage =>
  typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'import';

/** Each result's bytes, handed over rather than copied. */
function transferable(result: ImportResult): Transferable[] {
  return result.ok ? result.files.map((f) => f.bytes.buffer as ArrayBuffer) : [];
}

const BROKE: ImportProblem = {
  code: 'damaged',
  message: "This model couldn't be imported. It may be damaged.",
};

/** The worker's side: answers each `import` message. Never throws: a failure is a refusal. */
export function serveImports(port: WorkerPort, tools: ImportTools): void {
  port.addEventListener('message', (event) => {
    if (!isImport(event.data)) return;
    const { files, choices, taken } = event.data.request;
    void importModel(new Map(files), choices, tools, new Set(taken))
      .catch((): ImportResult => ({ ok: false, problems: [BROKE] }))
      .then((result) => {
        const answer: ImportAnswer = { type: 'result', result };
        port.postMessage(answer, transferable(result));
      });
  });
}

/** What the studio's side needs from a worker. A real `Worker` fits. */
export interface ImportWorker {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
  terminate(): void;
}

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
    worker.addEventListener('error', () => finish({ ok: false, problems: [BROKE] }));
    const files = request.files.map(([name, bytes]) => [name, bytes.slice()] as const);
    const message: ImportMessage = { type: 'import', request: { ...request, files } };
    worker.postMessage(
      message,
      files.map(([, bytes]) => bytes.buffer as ArrayBuffer),
    );
  });
}
